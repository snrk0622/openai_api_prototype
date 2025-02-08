import React, { useState, useRef, useEffect } from 'react'
import './App.css'

const AVAILABLE_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "o1",
  "o3-mini",
  "o1-mini",
]

type Message = {
  role: 'user' | 'assistant'
  model?: string
  content: string
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streamData, setStreamData] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0])
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    // 中断用のAbortControllerを作成
    const abortController = new AbortController()
    setAbortController(abortController)

    const userMessage = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch("http://localhost:3000/openai/stream/", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          message: input,
          model: selectedModel
        }),
        signal: abortController?.signal
      })
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let model = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader?.read() || { done: true, value: null }
        if (done) break
        const text = decoder.decode(value, { stream: true })

        text.split('\n').forEach(line => {
          if (!line) return
          const data = JSON.parse(line)
          if (data.type === 'model') {
            model = data.data
          } else if (data.type === 'text') {
            setStreamData(prev => prev + data.data)
            fullText += data.data
          }
        })
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        model,
        content: fullText
      }])
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'リクエストが中断されました。'
        }])
        setInput(userMessage.content)
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'エラーが発生しました。もう一度お試しください。'
        }])
      }
    } finally {
      setStreamData('')
      setIsLoading(false)
    }
  }

  const handleAbort = () => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
  }

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`message ${message.role === 'user' ? 'user' : 'assistant'}`}
          >
            <div className="message-content">
              {message.content}
              {message.model && (
                <div className="model-info">
                  {message.model}
                </div>
              )}
            </div>
          </div>
        ))}
        {streamData && (
          <div className="message assistant">
            <div className="message-content">{streamData}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="メッセージを入力..."
          disabled={isLoading}
        />
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={isLoading}
        >
          {AVAILABLE_MODELS.map(model => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        {isLoading && (
          <button type="button" onClick={handleAbort} disabled={!abortController} className="abort-button">
            中断
          </button>
        )}
        {!isLoading && (
          <button type="submit" disabled={!input.trim()}>
            送信
          </button>
        )}
      </form>
    </div>
  )
}

export default App
