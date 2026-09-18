// hooks/useVirtualScroll.ts — 虚拟滚动 hook (Sprint 3 #2)
//
// 用 IntersectionObserver 监听容器 viewport，只渲染可见的 items
// 适合长列表（赛事 >50）。对短列表(<30) 退化为普通渲染，零开销
//
// 用法:
//   const parentRef = useRef<HTMLDivElement>(null);
//   const visible = useVirtualScroll({ items, parentRef, itemHeight: 80, overscan: 5 });
//   return <div ref={parentRef} style={{ overflowY: 'auto', height: 600 }}>
//     <div style={{ height: items.length * itemHeight, position: 'relative' }}>
//       {visible.map(({ item, offsetTop }) => (
//         <div style={{ position: 'absolute', top: offsetTop, width: '100%' }}>...</div>
//       ))}
//     </div>
//   </div>

import { useEffect, useState, useRef, useMemo } from 'react';

interface Options<T> {
  items: T[];
  parentRef: React.RefObject<HTMLElement>;
  itemHeight: number;
  overscan?: number;         // 上下额外渲染的项数
  threshold?: number;        // 启用虚拟滚动的最小列表长度
}

interface Visible<T> {
  item: T;
  index: number;
  offsetTop: number;
}

export function useVirtualScroll<T>({ items, parentRef, itemHeight, overscan = 4, threshold = 50 }: Options<T>): { visible: Visible<T>[]; totalHeight: number; useVirtual: boolean } {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const rafRef = useRef<number | null>(null);

  // Scroll listener
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        setScrollTop(el.scrollTop);
        rafRef.current = null;
      });
    };
    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight || 600);
    });
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    setViewportHeight(el.clientHeight || 600);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [parentRef]);

  const useVirtual = items.length >= threshold;
  const totalHeight = items.length * itemHeight;

  const visible = useMemo<Visible<T>[]>(() => {
    if (!useVirtual) {
      // 退化: 全部渲染
      return items.map((it, i) => ({ item: it, index: i, offsetTop: i * itemHeight }));
    }
    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIdx = Math.min(items.length, Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan);
    const out: Visible<T>[] = [];
    for (let i = startIdx; i < endIdx; i++) {
      out.push({ item: items[i], index: i, offsetTop: i * itemHeight });
    }
    return out;
  }, [items, scrollTop, viewportHeight, itemHeight, overscan, useVirtual]);

  return { visible, totalHeight, useVirtual };
}