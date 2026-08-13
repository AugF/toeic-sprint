import type { Metadata } from "next";
import "./globals.css";
import "./priority.css";
export const metadata:Metadata={title:"TOEIC Sprint · 官方题库快速练习",description:"24 套 TOEIC Listening & Reading 官方题库优先级刷题工具"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
