"use client"

import { useState, useEffect, useRef } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { motion, AnimatePresence } from "framer-motion"
import { Send, User, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/components/providers/auth-provider"

interface ChatMessage {
  id: string
  token_id: string
  wallet_address: string
  message: string
  created_at: string
  username?: string
}

interface TokenChatProps {
  tokenAddress: string
  tokenId?: string
}

export function TokenChat({ tokenAddress, tokenId }: TokenChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [resolvedTokenId, setResolvedTokenId] = useState<string | null>(tokenId || null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClientComponentClient()
  const { activeWallet, isAuthenticated } = useAuth()

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Load initial messages and resolve token ID
  useEffect(() => {
    const loadMessages = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/token/${tokenAddress}/chat`)
        const data = await response.json()
        if (data.success) {
          setMessages(data.data.messages || [])
          // Store the token_id from the first message if available, for subscription
          if (data.data.messages?.length > 0 && data.data.messages[0].token_id) {
            setResolvedTokenId(data.data.messages[0].token_id)
          }
        }
      } catch (error) {
        console.error("[CHAT] Failed to load messages:", error)
      }
      setIsLoading(false)
    }

    loadMessages()
  }, [tokenAddress])

  // Subscribe to real-time updates (use token_id for filtering)
  useEffect(() => {
    if (!resolvedTokenId) return

    const channel = supabase
      .channel(`token-chat-${resolvedTokenId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "token_chat",
          filter: `token_id=eq.${resolvedTokenId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage
          setMessages((prev) => [...prev, newMsg])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [resolvedTokenId, supabase])

  // Scroll when messages update
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Send message
  const handleSend = async () => {
    if (!newMessage.trim() || !activeWallet || isSending) return

    setIsSending(true)
    try {
      const response = await fetch(`/api/token/${tokenAddress}/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-wallet-address": activeWallet.public_key,
          "x-session-id": activeWallet.session_id || "",
        },
        body: JSON.stringify({
          wallet_address: activeWallet.public_key,
          message: newMessage.trim(),
        }),
      })

      const data = await response.json()
      if (data.success) {
        setNewMessage("")
        // Message will be added via real-time subscription
      }
    } catch (error) {
      console.error("[CHAT] Failed to send message:", error)
    }
    setIsSending(false)
  }

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  // Truncate wallet address
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  return (
    <div className="flex flex-col h-full bg-black/30 rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-white font-medium">Live Chat</h3>
        <p className="text-xs text-white/50">{messages.length} messages</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[400px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/40 text-sm">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex gap-3 ${
                  msg.wallet_address === activeWallet?.public_key
                    ? "flex-row-reverse"
                    : ""
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white/60" />
                </div>
                <div
                  className={`flex-1 max-w-[80%] ${
                    msg.wallet_address === activeWallet?.public_key
                      ? "items-end"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-cyan-400 font-mono">
                      {truncateAddress(msg.wallet_address)}
                    </span>
                    <span className="text-xs text-white/30 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  <div
                    className={`px-3 py-2 rounded-lg text-sm ${
                      msg.wallet_address === activeWallet?.public_key
                        ? "bg-cyan-500/20 text-white"
                        : "bg-white/5 text-white/80"
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        {isAuthenticated ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex gap-2"
          >
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              maxLength={500}
              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
            <Button
              type="submit"
              disabled={!newMessage.trim() || isSending}
              className="bg-cyan-500 hover:bg-cyan-600 text-black px-4"
            >
              {isSending ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        ) : (
          <div className="text-center text-white/50 text-sm py-2">
            Connect wallet to chat
          </div>
        )}
      </div>
    </div>
  )
}

