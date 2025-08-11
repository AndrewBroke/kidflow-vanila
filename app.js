// =============================
// Конфигурация палитры узлов
// =============================
const BLOCK_TYPES = [
  { type: 'start', label: 'Начало', icon: '🚦', bg: '#E8FFE8', in: false, out: true },
  { type: 'action', label: 'Действие', icon: '🧩', bg: '#F0F8FF', in: true, out: true },
  // У decision два исхода — "yes" и "no"; подписи будут поставлены на рёбра
  { type: 'decision', label: 'Условие', icon: '🔷', bg: '#FFFBEA', in: true, out: true, outputs: ['yes', 'no'] },
  { type: 'end', label: 'Конец', icon: '🏁', bg: '#FFE8E8', in: true, out: false },
];

// Ключ для localStorage
const STORAGE_KEY = 'flow_v1';

// Глобалы из UMD
const React = window.React;
const ReactDOM = window.ReactDOM;
const ReactFlowGlobal = window.ReactFlow;

if (!React || !ReactDOM || !ReactFlowGlobal) {
  alert('Не загрузились React/ReactDOM/ReactFlow. Проверьте интернет и порядок скриптов.');
  //throw new Error('Libraries missing');
}

const h = React.createElement;
const { useState, useCallback, useRef, useEffect } = React;

const RF = window.ReactFlow;
const {
  ReactFlow: ReactFlowCmp,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useReactFlow,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
} = RF;


// ---------------------------------------
// Вспомогательные
// ---------------------------------------
function getTypeConfig(t) {
  return BLOCK_TYPES.find(b => b.type === t) || { type: t, label: t, bg: '#fff', in: true, out: true };
}
function genId(prefix = 'node') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// =======================================
// Узлы (универсальные компоненты)
// =======================================

// Универсальный прямоугольный узел (start/action/end)
function BoxNode(props) {
  const { id, type, data, isConnectable } = props;
  const cfg = getTypeConfig(type);
  const onText = (e) => data.onLabelChange(id, e.target.value);

  return h('div', { className: `node ${type}`, style: { background: cfg.bg } },
    h('div', { className: 'title' }, cfg.label),
    cfg.in ? h(Handle, { type: 'target', position: Position.Top, isConnectable }) : null,
    cfg.out ? h(Handle, { id: 'out', type: 'source', position: Position.Bottom, isConnectable }) : null,
    h('textarea', {
      className: 'editor',
      placeholder: 'Подпись...',
      value: data.label || '',
      onInput: onText,
    })
  );
}

// Ромб для decision (1 вход сверху, 2 выхода: справа — yes, снизу — no)
function DecisionNode(props) {
  const { id, type, data, isConnectable } = props;
  const cfg = getTypeConfig(type);
  const onText = (e) => data.onLabelChange(id, e.target.value);

  return h('div', { className: 'node decision node-decision-wrapper' },
    h(Handle, { type: 'target', position: Position.Top, isConnectable }),
    // diamond itself
    h('div', { className: 'diamond', style: { '--bg': cfg.bg } }),
    // overlay content (textarea)
    h('div', { className: 'diamond-content' },
      h('div', { style: { textAlign: 'center' } },
        h('div', { className: 'title' }, cfg.label + ' (if/else)'),
        h('textarea', {
          className: 'editor',
          placeholder: 'Условие...',
          value: data.label || '',
          onInput: onText,
        })
      )
    ),
    // yes (right)
    h(Handle, { id: 'yes', type: 'source', position: Position.Right, isConnectable }),
    h('div', { className: 'handle-label', style: { right: -8, top: '50%', transform: 'translate(100%,-50%)' } }, 'Да'),
    // no (bottom)
    h(Handle, { id: 'no', type: 'source', position: Position.Bottom, isConnectable }),
    h('div', { className: 'handle-label', style: { left: '50%', bottom: -8, transform: 'translate(-50%, 100%)' } }, 'Нет'),
  );
}

// Сопоставление типов узлов
const nodeTypes = {
  start: BoxNode,
  action: BoxNode,
  decision: DecisionNode,
  end: BoxNode,
};

// =======================================
// Основное приложение
// =======================================
function App() {
  const rf = useReactFlow();

  const [nodes, setNodes] = useState(() => {
    // начальный единственный start; позиция около центра, fitView выровняет
    return [{
      id: genId('start'),
      type: 'start',
      position: { x: 0, y: 0 },
      data: { label: 'Старт урока', onLabelChange: handleLabelChange },
    }];
  });
  const [edges, setEdges] = useState([]);

  // Нужен для подсказки "перетащите блок"
  const canvasRef = useRef(null);

  function handleLabelChange(id, text) {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, label: text, onLabelChange: handleLabelChange } } : n));
  }

  // Подключение рёбер: автоматически ставим стрелки и подписи для decision (yes/no)
  const onConnect = useCallback((params) => {
    const edgeLabel =
      params.sourceHandle === 'yes' ? 'Да' :
        params.sourceHandle === 'no' ? 'Нет' : '';

    setEdges((eds) =>
      addEdge(
        {
          ...params,
          label: edgeLabel,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 1.5 },
          labelStyle: { fontSize: 12, fill: '#333', fontWeight: 500, background: '#fff' },
        },
        eds
      )
    );
  }, []);

  const GRID_SIZE = 20;
  const snapToGrid = (val) => Math.round(val / GRID_SIZE) * GRID_SIZE;

  const onNodesChange = useCallback((changes) => {
    const snappedChanges = changes.map(change => {
      if (change.type === 'position' && change.position) {
        return {
          ...change,
          position: {
            x: snapToGrid(change.position.x),
            y: snapToGrid(change.position.y)
          }
        };
      }
      return change;
    });
    setNodes((nds) => applyNodeChanges(snappedChanges, nds));
  }, []);
  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => RF.applyEdgeChanges(changes, eds));
  }, []);

  // DnD из палитры
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    canvasRef.current?.classList.add('dragover');
  }, []);
  const onDragLeave = useCallback(() => {
    canvasRef.current?.classList.remove('dragover');
  }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    canvasRef.current?.classList.remove('dragover');

    const type = e.dataTransfer.getData('application/reactflow');
    if (!type) return;

    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const id = genId(type);

    setNodes((nds) =>
      nds.concat({
        id,
        type,
        position: pos,
        data: { label: '', onLabelChange: handleLabelChange },
      })
    );
  }, [rf]);

  // Сохранение / загрузка / очистка
  function save() {
    const data = rf.toObject ? rf.toObject() : { nodes, edges, viewport: rf.getViewport?.() };
    // Убедимся, что каждый узел хранит onLabelChange после загрузки
    const safe = {
      ...data,
      nodes: (data.nodes || nodes).map(n => ({ ...n, data: { ...n.data, onLabelChange: undefined } })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    alert('Сохранено в localStorage (' + STORAGE_KEY + ')');
  }
  function load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { alert('Нет данных в localStorage'); return; }
    const obj = JSON.parse(raw);
    const loadedNodes = (obj.nodes || []).map(n => ({ ...n, data: { ...n.data, onLabelChange: handleLabelChange } }));
    setNodes(loadedNodes);
    setEdges(obj.edges || []);
    // Попробуем восстановить вид
    setTimeout(() => { rf.fitView?.({ padding: 0.2 }); }, 0);
  }
  function clearAll() {
    if (!confirm('Очистить холст?')) return;
    setNodes([]);
    setEdges([]);
  }

  // После первого рендера отцентрировать
  useEffect(() => {
    window.appApi = { save, load, clearAll };
    return () => { if (window.appApi) window.appApi = null; };
  }, [/* не зависим от стейта */]);
  // Рендер
  return h('div', {
    style: { width: '100%', height: '100%', position: 'relative' },
    ref: canvasRef,
    className: 'canvas-inner',
  },
    h('div', { className: 'drop-hint' }, 'Перетащите блок из палитры на холст'),
    h(ReactFlowCmp, {
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      onConnect,
      nodeTypes,
      onDrop,
      onDragOver,
      onDragLeave,
      fitView: false,
      defaultEdgeOptions: { markerEnd: { type: MarkerType.ArrowClosed } },
    },
      h(MiniMap, null),
      h(Controls, null),
      h(Background, { variant: 'lines', gap: 24, size: 1 })
    ),
    // Кнопки тулбара берём из DOM
    null
  );
}

// =============================
// Монтирование и UI палитры
// =============================
function mountApp() {
  // Палитра
  const palette = document.getElementById('palette');
  palette.innerHTML = '<h3>Палитра блоков</h3>';
  BLOCK_TYPES.forEach(cfg => {
    const btn = document.createElement('div');
    btn.className = 'block-btn';
    btn.draggable = true;
    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/reactflow', cfg.type);
      e.dataTransfer.effectAllowed = 'move';
    });
    btn.innerHTML = `
      <span class="block-icon">${cfg.icon || '⬜'}</span>
      <span class="block-label">${cfg.label}</span>
      <span class="block-type">${cfg.type}</span>`;
    palette.appendChild(btn);
  });

  // Монтирование
  const rootEl = document.getElementById('flow-root');
  const root = ReactDOM.createRoot(rootEl);
  root.render(h(ReactFlowProvider, null, h(App, null)));

  // Кнопки — обращаемся к API, который App положит в window.appApi
  document.getElementById('saveBtn').onclick = () => window.appApi?.save?.();
  document.getElementById('loadBtn').onclick = () => window.appApi?.load?.();
  document.getElementById('clearBtn').onclick = () => window.appApi?.clearAll?.();
}

window.addEventListener('DOMContentLoaded', () => {
  window.BLOCK_TYPES = BLOCK_TYPES;
  window.nodeTypes = nodeTypes;
  mountApp();
});


// Обёртки для кнопок (получаем доступ к внутренним функциям через events)
let appSave = () => {
  // найдём ближайший ReactFlow instance через window._rfBridge
  if (window._rfBridge?.save) window._rfBridge.save();
};
let appLoad = () => {
  if (window._rfBridge?.load) window._rfBridge.load();
};
let appClear = () => {
  if (window._rfBridge?.clearAll) window._rfBridge.clearAll();
};

// Авто‑запуск
window.addEventListener('DOMContentLoaded', () => {
  // зарезервируем nodeTypes в глобале (можно не нужно, но вдруг пригодится)
  window.BLOCK_TYPES = BLOCK_TYPES;
  window.nodeTypes = nodeTypes;
  mountApp();
});
