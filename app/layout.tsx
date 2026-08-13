import type { Metadata } from "next";
import "./globals.css";
import "./priority.css";
export const metadata:Metadata={title:"TOEIC Sprint · 官方题库快速练习",description:"TOEIC Listening & Reading Official 11 Test 1 快速刷题工具"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
