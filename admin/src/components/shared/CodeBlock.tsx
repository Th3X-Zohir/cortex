import * as React from "react"
import { Copy, Check } from "lucide-react"
import { cn } from "~/lib/utils"

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
  className?: string
}

export function CodeBlock({
  code,
  language,
  filename,
  showLineNumbers = false,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = code.split("\n")

  return (
    <div className={cn("rounded-xl border border-border overflow-hidden", className)}>
      {(filename || language) && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background-secondary">
          <div className="flex items-center gap-2">
            {filename && (
              <span className="text-xs font-medium text-foreground">{filename}</span>
            )}
            {language && !filename && (
              <span className="text-xs text-muted-foreground uppercase tracking-wide">{language}</span>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <pre className="p-4 text-sm">
          <code className="font-mono">
            {showLineNumbers ? (
              <table className="w-full">
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td className="pr-4 text-right text-muted-foreground select-none w-8 shrink-0">
                        {i + 1}
                      </td>
                      <td className="text-foreground whitespace-pre">{line}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <span className="text-foreground whitespace-pre">{code}</span>
            )}
          </code>
        </pre>
      </div>
    </div>
  )
}