# useVirtualScroll

虚拟滚动 hook — 长列表只渲染可见项。

## API

```ts
const { visible, totalHeight, useVirtual } = useVirtualScroll({
  items: T[];
  parentRef: RefObject<HTMLElement>;
  itemHeight: number;
  overscan?: number;     // default 4
  threshold?: number;    // default 50 (小于此值全渲染)
});
```

## 返回值

- `visible`: `{ item, index, offsetTop }[]`
- `totalHeight`: 总高度 (px)
- `useVirtual`: 是否启用虚拟 (基于 threshold)

## 用法

```tsx
const parentRef = useRef<HTMLDivElement>(null);
const { visible, totalHeight, useVirtual } = useVirtualScroll({
  items: matches,
  parentRef,
  itemHeight: 96,
  overscan: 4,
});

return (
  <div ref={parentRef} style={{ overflowY: 'auto', maxHeight: '70vh' }}>
    <div style={{ height: totalHeight, position: 'relative' }}>
      {visible.map(({ item, offsetTop }) => (
        <div style={{ position: 'absolute', top: offsetTop, height: 96 }}>
          {/* render item */}
        </div>
      ))}
    </div>
  </div>
);
```

## 实现要点

- `ResizeObserver` 监听容器高度变化
- `scroll` 事件用 `requestAnimationFrame` 节流
- 退化: items < threshold 时全渲染（零开销）

## 实际位置
`apps/web/src/hooks/useVirtualScroll.ts` (80 行)

## Sprint
Sprint 3 #2