import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Bot, User } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

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

  const simulateBotResponse = (userMessage: string) => {
    setIsTyping(true);
    
    setTimeout(() => {
      let botResponse = "";
      const lowerMessage = userMessage.toLowerCase();

      if (lowerMessage.includes("chicken") || lowerMessage.includes("beef") || lowerMessage.includes("pork") ||
          lowerMessage.includes("雞") || lowerMessage.includes("牛") || lowerMessage.includes("豬")) {
        botResponse = t('chat.welcome');
      } else if (lowerMessage.includes("vegetable") || lowerMessage.includes("tomato") || lowerMessage.includes("lettuce") ||
                 lowerMessage.includes("蔬菜") || lowerMessage.includes("番茄") || lowerMessage.includes("生菜")) {
        botResponse = t('chat.analyzing');
      } else if (lowerMessage.includes("find") || lowerMessage.includes("supplier") || lowerMessage.includes("match") ||
                 lowerMessage.includes("尋找") || lowerMessage.includes("供應商") || lowerMessage.includes("媒合")) {
        const requirements = [
          "Fresh Tomatoes",
          "Lettuce",
          "Chicken Breast",
          "Onions",
          "Garlic",
        ];
        
        botResponse = t('chat.response').replace('{ingredients}', requirements.join("\n"));
        
        if (onRequirementsSubmit) {
          setTimeout(() => {
            onRequirementsSubmit(requirements);
          }, 1000);
        }
      } else {
        botResponse = t('chat.analyzing');
      }

      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          text: botResponse,
          sender: "bot",
          timestamp: new Date(),
        },
      ]);
      setIsTyping(false);
    }, 1000 + Math.random() * 500);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now(),
      text: inputValue,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    simulateBotResponse(inputValue);
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
