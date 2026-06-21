import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Bot, User } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { analyzeChat, chatReply, formatIngredient } from "@/lib/api";

interface Message {
  id: number;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

interface ChatbotProps {
  onRequirementsSubmit?: (requirements: string[]) => void;
}

const Chatbot = ({ onRequirementsSubmit }: ChatbotProps) => {
  const { t } = useLanguage();
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: t('chat.welcome'),
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const pushBotMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), text, sender: "bot", timestamp: new Date() },
    ]);
  };

  // Detect when the customer wants us to start supplier matching.
  const wantsMatching = (msg: string) => {
    const lower = msg.toLowerCase();
    return [
      "find", "supplier", "match", "quote",
      "尋找", "供應商", "媒合", "報價", "採購", "下單",
    ].some((kw) => lower.includes(kw));
  };

  const respond = async (history: Message[], userMessage: string) => {
    setIsTyping(true);

    const apiMessages = history.map((m) => ({ role: m.sender, text: m.text }));

    try {
      // Real conversational reply from Gemini.
      const { reply } = await chatReply(apiMessages);
      if (reply) pushBotMessage(reply);

      // If the customer is ready to match suppliers, extract requirements via AI
      // (this also creates a pending analysis record for admin review).
      if (wantsMatching(userMessage) && onRequirementsSubmit) {
        const result = await analyzeChat(apiMessages);
        if (result.ingredients.length > 0) {
          const formatted = result.ingredients.map(formatIngredient);
          pushBotMessage(`已為您整理出採購需求:\n${formatted.join("\n")}\n\n正在為您媒合供應商…`);
          onRequirementsSubmit(formatted);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 服務暫時無法使用";
      pushBotMessage(`抱歉,AI 服務暫時無法回覆,請稍後再試。(${message})`);
      toast.error(`AI 對話失敗:${message}`);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = () => {
    if (!inputValue.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now(),
      text: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    const history = [...messages, userMessage];
    setMessages(history);
    setInputValue("");
    void respond(history, userMessage.text);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <section className="py-16 bg-background">
      <div className="container px-4 mx-auto">
        <div className="max-w-4xl mx-auto">
          <div className="text-center space-y-4 mb-8">
            <h2 className="text-4xl md:text-5xl font-bold">
              {t('chat.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t('chat.subtitle')}
            </p>
          </div>

          <Card className="overflow-hidden shadow-medium">
            <div className="bg-primary/5 p-4 border-b border-border">
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{t('chat.title')}</h3>
                  <p className="text-xs text-muted-foreground">Online</p>
                </div>
              </div>
            </div>

            <div className="h-[500px] overflow-y-auto p-4 space-y-4 bg-muted/10">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start space-x-2 ${
                    message.sender === "user" ? "flex-row-reverse space-x-reverse" : ""
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.sender === "user"
                        ? "bg-secondary/20"
                        : "bg-primary/10"
                    }`}
                  >
                    {message.sender === "user" ? (
                      <User className="w-5 h-5 text-secondary" />
                    ) : (
                      <Bot className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                      message.sender === "user"
                        ? "bg-secondary text-secondary-foreground rounded-tr-none"
                        : "bg-primary/10 text-foreground rounded-tl-none"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-line">{message.text}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex items-start space-x-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="bg-primary/10 rounded-2xl rounded-tl-none px-4 py-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-border bg-background">
              <div className="flex space-x-2">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={t('chat.placeholder')}
                  className="flex-1"
                />
                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default Chatbot;
