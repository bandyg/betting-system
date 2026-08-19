import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, font, spacing } from './tokens';
import { useTheme } from './theme';

type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'code'; content: string }
  | { type: 'link'; content: string; url: string };

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: 'text', content: text.slice(last, m.index) });
    const raw = m[0];
    if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push({ type: 'bold', content: raw.slice(2, -2) });
    } else if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push({ type: 'code', content: raw.slice(1, -1) });
    } else if (raw.startsWith('[')) {
      const link = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) tokens.push({ type: 'link', content: link[1], url: link[2] });
      else tokens.push({ type: 'text', content: raw });
    } else if (raw.startsWith('*') && raw.endsWith('*') && raw.length > 2) {
      tokens.push({ type: 'italic', content: raw.slice(1, -1) });
    } else {
      tokens.push({ type: 'text', content: raw });
    }
    last = m.index + raw.length;
  }
  if (last < text.length) tokens.push({ type: 'text', content: text.slice(last) });
  return tokens;
}

function InlineText({ tokens }: { tokens: InlineToken[] }) {
  const t = useTheme();
  return (
    <>
      {tokens.map((tok, i) => {
        switch (tok.type) {
          case 'bold':
            return (
              <Text key={i} style={{ fontWeight: font.bold, color: t.text }}>
                {tok.content}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} style={{ fontStyle: 'italic' }}>
                {tok.content}
              </Text>
            );
          case 'code':
            return (
              <Text key={i} style={styles.code}>
                {tok.content}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={i}
                style={[styles.link, { color: t.secondary }]}
                onPress={() => Linking.openURL(tok.url).catch(() => {})}
              >
                {tok.content}
              </Text>
            );
          default:
            return <Text key={i}>{tok.content}</Text>;
        }
      })}
    </>
  );
}

function BodyText({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text style={[styles.paragraph, { color: t.textSecondary }]}>
      {children}
    </Text>
  );
}

/** MarkdownText — 轻量 markdown 渲染（标题/粗斜体/行内代码/链接/列表/分隔线），无第三方依赖 */
export function MarkdownText({ body }: { body: string }) {
  const t = useTheme();
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length > 0) {
      blocks.push(
        <BodyText key={`p${blocks.length}`}>
          <InlineText tokens={tokenizeInline(para.join(' '))} />
        </BodyText>,
      );
      para = [];
    }
  };

  body.split('\n').forEach((line, idx) => {
    const trimmed = line.trim();
    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      blocks.push(
        <Text
          key={`h${idx}`}
          style={[
            styles.heading,
            { color: t.text },
            level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3,
          ]}
        >
          <InlineText tokens={tokenizeInline(heading[2])} />
        </Text>,
      );
      return;
    }
    if (/^(---+|\*\*\*+)$/.test(trimmed)) {
      flush();
      blocks.push(<View key={`hr${idx}`} style={[styles.hr, { backgroundColor: t.border }]} />);
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flush();
      blocks.push(
        <View key={`li${idx}`} style={styles.listRow}>
          <Text style={[styles.bullet, { color: t.secondary }]}>•</Text>
          <BodyText>
            <InlineText tokens={tokenizeInline(bullet[1])} />
          </BodyText>
        </View>,
      );
      return;
    }
    const numbered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      flush();
      blocks.push(
        <View key={`nl${idx}`} style={styles.listRow}>
          <Text style={[styles.num, { color: t.secondary }]}>{numbered[1]}.</Text>
          <BodyText>
            <InlineText tokens={tokenizeInline(numbered[2])} />
          </BodyText>
        </View>,
      );
      return;
    }
    if (trimmed === '') {
      flush();
      return;
    }
    para.push(trimmed);
  });
  flush();

  return <View>{blocks}</View>;
}

const styles = StyleSheet.create({
  paragraph: {
    fontSize: fontSize.md,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  heading: {
    fontWeight: font.bold,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  h1: { fontSize: fontSize.xl },
  h2: { fontSize: fontSize.lg },
  h3: { fontSize: fontSize.md },
  hr: { height: 1, marginVertical: spacing.md },
  listRow: { flexDirection: 'row', marginBottom: spacing.xs },
  bullet: { fontSize: fontSize.md, marginRight: spacing.sm },
  num: { fontSize: fontSize.md, marginRight: spacing.sm },
  code: {
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    color: colors.secondary,
    backgroundColor: 'rgba(6,182,212,0.1)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  link: { textDecorationLine: 'underline' },
});