import React, { useState, useRef, useEffect } from 'react'
import './App.css'

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

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
        body: JSON.stringify({ message: input })
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
      console.error('Error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'エラーが発生しました。もう一度お試しください。'
      }])
    } finally {
      setStreamData('')
      setIsLoading(false)
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
        <button type="submit" disabled={isLoading || !input.trim()}>
          送信
        </button>
      </form>
    </div>
  )
}

export default App
