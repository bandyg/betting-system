# Layout 布局组件

页面骨架与内容块：Card、SectionTitle、Screen、FlashMsg、PromotionCard、Banner。

## Card

卡片容器（圆角 + 边框 + 阴影），可切换玻璃拟态背景。

### Props

| Prop       | Type                    | Default | 描述 |
|------------|-------------------------|---------|------|
| `children` | `React.ReactNode`       | —（必填） | 内容 |
| `style`    | `StyleProp<ViewStyle>`  | —       | 附加样式 |
| `glass`    | `boolean`               | `false` | `true` 用 `t.bgGlass`（半透明玻璃底），`false` 用 `t.bgElevated` |
| `testID`   | `string`                | —       | 测试 ID |

## SectionTitle

区块标题文本（xl 号粗体，自带 12px 下边距）。

### Props

| Prop       | Type                    | Default | 描述 |
|------------|-------------------------|---------|------|
| `children` | `React.ReactNode`       | —（必填） | 标题内容 |
| `style`    | `StyleProp<TextStyle>`  | —       | 附加样式（覆盖默认颜色/字号） |

## Screen

页面级容器：主题背景色 + `FadeInDown`（320ms）进入转场，撑满剩余空间（`flex: 1`）。

### Props

| Prop       | Type                   | Default | 描述 |
|------------|------------------------|---------|------|
| `children` | `React.ReactNode`      | —（必填） | 页面内容 |
| `style`    | `StyleProp<ViewStyle>` | —       | 附加样式 |

## FlashMsg

成功/失败提示条，`BounceIn`（420ms）回弹进入。

### Props

| Prop  | Type                                       | Default | 描述 |
|-------|--------------------------------------------|---------|------|
| `msg` | `{ kind: 'ok' \| 'err'; text: string }`    | —（必填） | `kind: 'ok'` 绿底绿字，`'err'` 红底红字 |

## PromotionCard

CRM 促销卡片：标题 + 描述 + 奖励标签 + 领取按钮/状态（基于玻璃 Card，横向布局）。

### Props

| Prop          | Type                                                 | Default | 描述 |
|---------------|------------------------------------------------------|---------|------|
| `title`       | `string`                                             | —（必填） | 促销标题 |
| `description` | `string`                                             | —（必填） | 促销说明 |
| `bonusLabel`  | `string`                                             | —（必填） | 奖励标签（青色胶囊） |
| `claimStatus` | `'pending' \| 'approved' \| 'rejected' \| null`      | `null`  | `approved` 显示「已领取 ✓」（绿）、`pending` 显示「审核中…」（黄）、`rejected` 显示「已拒绝」（红）、`null` 显示「领取」按钮 |
| `onClaim`     | `() => void`                                         | —       | 点击「领取」回调 |

## Banner

CMS 公告横幅（📢 图标 + 单行文案，紫底强边框）。

### Props

| Prop   | Type     | Default | 描述 |
|--------|----------|---------|------|
| `text` | `string` | —（必填） | 公告文案 |

## 用法

```tsx
import { Screen, SectionTitle, Card, FlashMsg, PromotionCard, Banner, Button } from '@betting/ui';

<Screen style={{ padding: 16 }}>
  <Banner text="周日英超专场：串关赔付 +10%" />

  <SectionTitle>我的投注</SectionTitle>
  <Card>
    <Button title="查看全部" variant="ghost" onPress={go} />
  </Card>

  <FlashMsg msg={{ kind: 'ok', text: '下注成功' }} />
  <FlashMsg msg={{ kind: 'err', text: '余额不足' }} />

  <PromotionCard
    title="新用户礼包"
    description="首存满 100 赠 50"
    bonusLabel="+50"
    claimStatus={null}
    onClaim={claim}
  />
</Screen>
```

## 实际位置
`packages/ui/src/components.tsx`
