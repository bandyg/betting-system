# useToast / useTheme

store hook 封装 (zustand)。

## useToast

```ts
import { useToast } from '../hooks/useToast.js';
const push = useToast((s) => s.push);
push('ok', '保存成功');
```

注：更常用 `import { toast }` 直接用 `toast.ok('text')` 静态方法。

## useTheme

```ts
import { useTheme } from '../hooks/useTheme.js';
const { theme, setTheme } = useTheme();
```

## 实际位置
- `apps/web/src/hooks/useToast.ts`
- `apps/web/src/hooks/useTheme.ts`
- `apps/web/src/store.ts` (底层 store)