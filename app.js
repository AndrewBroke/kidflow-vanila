// === Config: блоки и их дефолтные параметры (расширяемость через одну константу) ===
const BLOCK_TYPES = [
  { type: 'start', label: 'Начало', icon: '🚦', bg: '#E8FFE8', in: false, out: true, resizable: true, minW: 160, minH: 64 },
  { type: 'action', label: 'Действие', icon: '🧩', bg: '#FFF7D6', in: true, out: true, resizable: true, minW: 180, minH: 72 },
  { type: 'decision', label: 'Условие', icon: '❓', bg: '#E6F0FF', in: true, out: 'yes/no', resizable: true, minW: 200, minH: 120 },
  { type: 'end', label: 'Конец', icon: '🏁', bg: '#FFE0E0', in: true, out: false, resizable: true, minW: 160, minH: 64 },
];
// Быстрый доступ по типу
const TYPE_MAP = Object.fromEntries(BLOCK_TYPES.map(b => [b.type, b]));

// === Утилиты ===
const q = (v) => Math.round(v / 16) * 16; // привязка к сетке 16px
const uid = (() => { let i = 1; return (p = 'n') => `${p}-${i++}`; })();
const STORAGE_KEY = 'flow_v1';

// === Палитра слева (чистый DOM, DnD-источник) ===
function renderPalette() {
  const root = document.getElementById('palette');
  root.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'palette-title';
  title.textContent = 'Палитра блоков';
  root.appendChild(title);

  BLOCK_TYPES.forEach(bt => {
    const card = document.createElement('div');
    card.className = 'card';
    card.draggable = true;
    card.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('application/reactflow', bt.type);
      ev.dataTransfer.effectAllowed = 'move';
    });
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = bt.icon;
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = bt.label;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = bt.type;

    card.append(icon, title, meta);
    root.appendChild(card);
  });
}

// === React / ReactFlow UMD ===
const RF = window.ReactFlow;
const { React: R, ReactDOM: RD } = window;

// Деструктурируем нужные API из UMD
const {
  ReactFlow: ReactFlowComp,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  MarkerType,
  useNodesState,
  useEdgesState,
} = RF;

// === Узел (один универсальный компонент для всех типов) ===
function BlockNode(props) {
  const { id, data, selected, style } = props;
  const cfg = TYPE_MAP[data.kind] || {};
  const bg = cfg.bg || '#fff';
  const canIn = !!cfg.in;
  const outKind = cfg.out; // true | false | 'yes/no'
  const icon = data.icon || cfg.icon || '⬜';
  const title = data.title || cfg.label || data.kind;
  const minW = cfg.minW || 120;
  const minH = cfg.minH || 60;

  // Ресайз: работаем чисто на событиях, отключая перетаскивание узла на время
  const onResizePointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = e.currentTarget.parentElement.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;

    data.setNodeDraggable(id, false); // временно отключаем перетаскивание

    const move = (ev) => {
      ev.stopPropagation();
      const dw = ev.clientX - startX;
      const dh = ev.clientY - startY;
      const rawW = startW + dw;
      const rawH = startH + dh;
      const w = Math.max(minW, q(rawW));
      const h = Math.max(minH, q(rawH));
      data.updateNodeSize(id, { width: w, height: h });
    };
    const up = (ev) => {
      ev.stopPropagation();
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      data.setNodeDraggable(id, true);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  };

  const body = R.createElement('textarea', {
    className: 'block-text',
    spellCheck: false,
    value: data.label ?? '',
    onInput: (ev) => data.updateLabel(id, ev.currentTarget.value),
    placeholder: 'Подпись...',
  });

  // Заголовок
  const header = R.createElement('div', { className: 'block-header', style: { background: bg } },
    R.createElement('span', null, icon),
    R.createElement('span', null, title)
  );

  // Визуальная «ромб» вставка для decision
  const decisionDecor = data.kind === 'decision'
    ? R.createElement('div', { className: 'decision-wrap' },
      R.createElement('div', { className: 'decision-shape' })
    )
    : null;

  // Лейблы «Да/Нет» внизу
  const yesNoLabels = data.kind === 'decision' && outKind === 'yes/no'
    ? R.createElement('div', { className: 'handle-labels' },
      R.createElement('span', null, 'Да'),
      R.createElement('span', null, 'Нет')
    )
    : null;

  // Хендлы
  const handles = [
    canIn ? R.createElement(Handle, {
      key: 'in',
      type: 'target',
      id: 'in',
      position: Position.Top,
    }) : null,
    outKind === true ? R.createElement(Handle, {
      key: 'out1',
      type: 'source',
      id: 'out',
      position: Position.Bottom,
    }) : null,
    outKind === 'yes/no' ? R.createElement(Handle, {
      key: 'y',
      type: 'source',
      id: 'yes',
      position: Position.Bottom,
      style: { left: '25%', transform: 'translateX(-50%)' }
    }) : null,
    outKind === 'yes/no' ? R.createElement(Handle, {
      key: 'n',
      type: 'source',
      id: 'no',
      position: Position.Bottom,
      style: { left: '75%', transform: 'translateX(-50%)' }
    }) : null,
  ];

  // Корневой контейнер узла
  const nodeCls = [
    'block-node',
    data.kind === 'start' ? 'node-start' : '',
    data.kind === 'end' ? 'node-end' : '',
  ].filter(Boolean).join(' ');

  return R.createElement('div', { className: nodeCls, style },
    header,
    R.createElement('div', { className: 'block-body' }, body),
    decisionDecor,
    yesNoLabels,
    cfg.resizable ? R.createElement('div', { className: 'resize-handle', onPointerDown: onResizePointerDown }) : null,
    ...handles
  );
}

// === Приложение ===
function App() {
  const wrapperId = 'flow-wrapper';
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rf, setRf] = R.useState(null);

  // Помощники, которые прокидываются внутрь data каждого узла
  const updateLabel = R.useCallback((id, value) => {
    setNodes((nds) => nds.map(n => n.id === id ? { ...n, data: { ...n.data, label: value } } : n));
  }, [setNodes]);

  const updateNodeSize = R.useCallback((id, size) => {
    setNodes((nds) => nds.map(n => n.id === id ? { ...n, style: { ...(n.style || {}), width: size.width, height: size.height } } : n));
  }, [setNodes]);

  const setNodeDraggable = R.useCallback((id, value) => {
    setNodes((nds) => nds.map(n => n.id === id ? { ...n, draggable: !!value } : n));
  }, [setNodes]);

  // Создание узла из палитры по типу
  function makeNodeFromType(type, position) {
    const cfg = TYPE_MAP[type];
    if (!cfg) throw new Error('Unknown type: ' + type);

    const id = uid(type);
    const base = {
      id,
      type: 'block',                 // все узлы одного компонента
      position,
      style: { width: cfg.minW, height: cfg.minH, background: cfg.bg, minWidth: cfg.minW, minHeight: cfg.minH },
      draggable: true,
      data: {
        kind: type,
        title: cfg.label,
        label: '',
        icon: cfg.icon,
        updateLabel,
        updateNodeSize,
        setNodeDraggable
      }
    };
    return base;
  }

  // Хидрация (после загрузки из localStorage): добавляет функции в data
  function hydrate(nodes) {
    return nodes.map(n => ({
      ...n,
      data: {
        ...(n.data || {}),
        updateLabel,
        updateNodeSize,
        setNodeDraggable
      }
    }));
  }

  // Стартовое состояние: один start по центру (fitView)
  R.useEffect(() => {
    if (nodes.length === 0 && rf) {
      const center = rf.project({ x: 400, y: 220 });
      setNodes([makeNodeFromType('start', center)]);
      // Немного позже подстроиться по виду
      setTimeout(() => rf.fitView({ padding: 0.2 }), 0);
    }
  }, [rf]); // eslint-disable-line

  // DnD обработчики холста
  const onDragOver = R.useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = R.useCallback((e) => {
    e.preventDefault();
    if (!rf) return;
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type) return;

    const bounds = document.getElementById(wrapperId).getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const y = e.clientY - bounds.top;

    // Сначала квантуем к сетке в координатах экрана, затем проектируем в координаты графа
    const pos = rf.project({ x: q(x), y: q(y) });
    const node = makeNodeFromType(type, pos);
    setNodes(nds => nds.concat(node));
  }, [rf, setNodes]);

  // Соединение ребром
  const onConnect = R.useCallback((params) => {
    // подпись ребра в зависимости от sourceHandle у decision
    let label;
    if (params.sourceHandle === 'yes') label = 'Да';
    if (params.sourceHandle === 'no') label = 'Нет';

    setEdges((eds) => addEdge({
      ...params,
      markerEnd: { type: MarkerType.ArrowClosed },
      label
    }, eds));
  }, [setEdges]);

  // Сохранение / загрузка
  function save() {
    const payload = { nodes, edges };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    alert('Схема сохранена в localStorage (' + STORAGE_KEY + ').');
  }
  function load() {
    const txt = localStorage.getItem(STORAGE_KEY);
    if (!txt) { alert('Нет сохранённой схемы.'); return; }
    try {
      const { nodes: n, edges: e } = JSON.parse(txt);
      setNodes(hydrate(n || []));
      setEdges(e || []);
      setTimeout(() => rf && rf.fitView({ padding: 0.2 }), 0);
    } catch (err) {
      console.error(err);
      alert('Ошибка загрузки схемы.');
    }
  }

  // Навешиваем кнопки toolbar (вне ReactFlow)
  R.useEffect(() => {
    const saveBtn = document.getElementById('saveBtn');
    const loadBtn = document.getElementById('loadBtn');
    const onS = () => save();
    const onL = () => load();
    saveBtn.addEventListener('click', onS);
    loadBtn.addEventListener('click', onL);
    return () => {
      saveBtn.removeEventListener('click', onS);
      loadBtn.removeEventListener('click', onL);
    };
  }, [nodes, edges, rf]);

  // nodeTypes: один универсальный компонент
  const nodeTypes = R.useMemo(() => ({ block: BlockNode }), []);

  // Рендер ReactFlow
  return R.createElement('div', { style: { width: '100%', height: '100%' } },
    R.createElement(ReactFlowComp, {
      nodes,
      edges,
      onNodesChange,
      onEdgesChange,
      onConnect,
      onDrop,
      onDragOver,
      nodeTypes,
      snapToGrid: true,
      snapGrid: [16, 16],
      onInit: setRf,
      fitView: false,
      defaultEdgeOptions: { markerEnd: { type: MarkerType.ArrowClosed } }
    },
      R.createElement(Background, { gap: 16, size: 1 }),
      R.createElement(Controls, null),
      R.createElement(MiniMap, null)
    )
  );
}

// === Bootstrap ===
renderPalette();

const rootEl = document.getElementById('flow-wrapper');
const root = RD.createRoot(rootEl);
root.render(React.createElement(App));
