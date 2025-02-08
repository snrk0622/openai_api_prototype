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
  aborted: boolean
  tokens?: number
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streamData, setStreamData] = useState<Message>({
    role: 'assistant',
    model: '',
    content: '',
    aborted: false,
    tokens: 0
  })
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

    const userMessage: Message = { role: 'user', content: input, aborted: false }
    const contextMessages = [...messages, userMessage]
      .filter(message => !message.aborted)
      .map(message => ({
        role: message.role,
        content: message.content
    }))
    let fullText = ''
    let fullCompletionTokens = 0
    let model = ''
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
          messages: contextMessages,
          model: selectedModel
        }),
        signal: abortController?.signal
      })
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader?.read() || { done: true, value: null }
        if (done) break
        const text = decoder.decode(value, { stream: true })
        text.split('\n').forEach(line => {
          if (!line) return
          const data = JSON.parse(line)
          if (data.type === 'model') {
            model = data.data
            // messagesの最後の要素のトークンを更新する
            setMessages(prev => {
              const lastMessage = prev[prev.length - 1]
              if (lastMessage) {
                lastMessage.tokens = data.tokens
              }
              return [...prev]
            })
          } else if (data.type === 'text') {
            setStreamData(prev => ({
              ...prev,
              content: prev.content + data.data,
              tokens: prev.tokens + data.tokens
            }))
            fullText += data.data
            fullCompletionTokens += data.tokens
          }
        })
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        model,
        content: fullText,
        aborted: false,
        tokens: fullCompletionTokens
      }])
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          model,
          content: fullText,
          aborted: true,
          tokens: fullCompletionTokens
        }])
        setInput(userMessage.content)
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          model,
          content: 'エラーが発生しました。もう一度お試しください。',
          aborted: false,
          tokens: fullCompletionTokens
        }])
        setInput(userMessage.content)
      }
    } finally {
      setStreamData({
        role: 'assistant',
        model: '',
        content: '',
        aborted: false,
        tokens: 0
      })
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
              <div className="message-info">
                {message.model && (
                  <div className="model-info">
                    {message.model}
                  </div>
                )}
                {message.aborted && (
                  <div className="aborted-info">
                    中断されました
                  </div>
                )}
                {message.tokens && (
                  <div className="tokens-info">
                    {message.tokens} tokens
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {streamData.content && (
          <div className="message assistant">
            <div className="message-content">
              {streamData.content}
              <div className="message-info">
                <div className="model-info">
                  {selectedModel}
                </div>
                <div className="tokens-info">
                  {streamData.tokens} tokens
                </div>
              </div>
            </div>
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
