// CSS 资源类型声明（metro 在构建期处理 .css，这里只补 TS 类型）
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.css';
