import { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'zh';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations = {
  en: {
    // Hero
    'hero.title': 'AI Restaurant Menu Analysis',
    'hero.subtitle': 'Upload your menu, AI instantly identifies ingredients and matches the best suppliers',
    'hero.cta': 'Start Analysis Now',
    'hero.learn': 'Learn More',
    'hero.stat1': 'Analysis Time',
    'hero.stat1.value': '< 30 seconds',
    'hero.stat2': 'Recognition Accuracy',
    'hero.stat2.value': '98%',
    'hero.stat3': 'Suppliers',
    'hero.stat3.value': '500+',
    
    // How It Works
    'how.title': 'How It Works',
    'how.subtitle': 'Three simple steps to match your ingredient procurement needs',
    'how.step1.title': 'Upload Menu',
    'how.step1.desc': 'Take a photo or upload your restaurant menu image',
    'how.step2.title': 'AI Analysis',
    'how.step2.desc': 'AI automatically identifies all ingredients and quantities needed',
    'how.step3.title': 'Match Suppliers',
    'how.step3.desc': 'System recommends the most suitable suppliers based on your needs',
    
    // Chatbot
    'chat.title': 'Ingredient Requirements Chat',
    'chat.subtitle': 'Tell us your ingredient needs, and we\'ll match the best suppliers for you',
    'chat.placeholder': 'e.g., I need fresh tomatoes, lettuce, chicken breast...',
    'chat.send': 'Send',
    'chat.welcome': 'Hello! I\'m your ingredient procurement assistant. Please tell me what ingredients you need, and I\'ll help you find suitable suppliers.',
    'chat.analyzing': 'Analyzing your requirements...',
    'chat.response': 'I\'ve identified the following ingredients from your needs:\n\n{ingredients}\n\nClick the button below to view matched suppliers!',
    'chat.viewSuppliers': 'View Matched Suppliers',
    
    // Menu Upload
    'upload.title': 'Upload Menu for Analysis',
    'upload.subtitle': 'Upload a clear photo of your menu, and AI will automatically identify the ingredients you need',
    'upload.drag': 'Drag and drop menu image here',
    'upload.or': 'or',
    'upload.select': 'Select File',
    'upload.support': 'Supports JPG, PNG formats, max 5MB',
    'upload.preview': 'Image Preview',
    'upload.remove': 'Remove Image',
    'upload.analyze': 'Start Analysis',
    'upload.analyzing': 'Analyzing...',
    
    // Ingredient Analysis
    'analysis.title': 'Identified Ingredients',
    'analysis.find': 'Find Suppliers',
    
    // Supplier Match
    'supplier.title': 'Recommended Suppliers',
    'supplier.subtitle': 'We\'ve found the following suppliers that match your ingredient needs',
    'supplier.rating': 'Rating',
    'supplier.delivery': 'Delivery',
    'supplier.contact': 'Contact Supplier',
    'supplier.specialties': 'Specialties',
    'supplier.back': 'Back',
    
    // Not Found
    'notfound.title': '404',
    'notfound.message': 'Oops! Page not found',
    'notfound.home': 'Return to Home',
    
    // Auth
    'auth.login': 'Login',
    'auth.signup': 'Sign Up',
    'auth.loginDesc': 'Enter your credentials to access your account',
    'auth.signupDesc': 'Create an account to get started',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.displayName': 'Display Name',
    'auth.emailPlaceholder': 'your@email.com',
    'auth.passwordPlaceholder': 'Enter your password',
    'auth.displayNamePlaceholder': 'Your name',
    'auth.loading': 'Loading...',
    'auth.noAccount': 'Don\'t have an account? Sign up',
    'auth.hasAccount': 'Already have an account? Login',
    'auth.loginSuccess': 'Login successful!',
    'auth.welcomeBack': 'Welcome back!',
    'auth.signupSuccess': 'Account created!',
    'auth.checkEmail': 'Please check your email to confirm your account',
    'auth.error': 'Error',
    'auth.logout': 'Logout',
    'auth.myAccount': 'My Account',
    
    // Buyer Profiles
    'buyers.title': 'Featured Restaurant Buyers',
    'buyers.subtitle': 'Connect with professional buyers from leading restaurants',
    'buyers.experience': 'Experience',
    'buyers.years': 'Years',
    'buyers.rating': 'Satisfaction',
    'buyers.expertise': 'Product Expertise',
    'buyers.markets': 'Markets of Experience',
    'buyers.brands': 'Sourced Brands',
  },
  zh: {
    // Hero
    'hero.title': 'AI餐廳菜單分析',
    'hero.subtitle': '上傳菜單，AI即時識別食材並媒合最佳供應商',
    'hero.cta': '立即開始分析',
    'hero.learn': '了解更多',
    'hero.stat1': '分析時間',
    'hero.stat1.value': '< 30秒',
    'hero.stat2': '識別準確率',
    'hero.stat2.value': '98%',
    'hero.stat3': '合作供應商',
    'hero.stat3.value': '500+',
    
    // How It Works
    'how.title': '運作方式',
    'how.subtitle': '三個簡單步驟，完成食材採購媒合',
    'how.step1.title': '上傳菜單',
    'how.step1.desc': '拍照或上傳您的餐廳菜單圖片',
    'how.step2.title': 'AI分析',
    'how.step2.desc': 'AI自動識別所有需要的食材和數量',
    'how.step3.title': '媒合供應商',
    'how.step3.desc': '系統根據需求推薦最合適的供應商',
    
    // Chatbot
    'chat.title': '食材需求對話',
    'chat.subtitle': '告訴我們您的食材需求，我們將為您媒合最佳供應商',
    'chat.placeholder': '例如：我需要新鮮番茄、生菜、雞胸肉...',
    'chat.send': '發送',
    'chat.welcome': '您好！我是您的食材採購助手。請告訴我您需要什麼食材，我會幫您找到合適的供應商。',
    'chat.analyzing': '正在分析您的需求...',
    'chat.response': '我已經從您的需求中識別出以下食材：\n\n{ingredients}\n\n點擊下方按鈕查看媒合的供應商！',
    'chat.viewSuppliers': '查看媒合供應商',
    
    // Menu Upload
    'upload.title': '上傳菜單進行分析',
    'upload.subtitle': '上傳清晰的菜單照片，AI將自動識別您需要的食材',
    'upload.drag': '拖放菜單圖片到此處',
    'upload.or': '或',
    'upload.select': '選擇檔案',
    'upload.support': '支援 JPG、PNG 格式，最大 5MB',
    'upload.preview': '圖片預覽',
    'upload.remove': '移除圖片',
    'upload.analyze': '開始分析',
    'upload.analyzing': '分析中...',
    
    // Ingredient Analysis
    'analysis.title': '已識別食材',
    'analysis.find': '尋找供應商',
    
    // Supplier Match
    'supplier.title': '推薦供應商',
    'supplier.subtitle': '我們為您找到以下符合食材需求的供應商',
    'supplier.rating': '評分',
    'supplier.delivery': '配送',
    'supplier.contact': '聯繫供應商',
    'supplier.specialties': '專長',
    'supplier.back': '返回',
    
    // Not Found
    'notfound.title': '404',
    'notfound.message': '糟糕！找不到頁面',
    'notfound.home': '返回首頁',
    
    // Auth
    'auth.login': '登入',
    'auth.signup': '註冊',
    'auth.loginDesc': '輸入您的憑證以存取您的帳戶',
    'auth.signupDesc': '建立帳戶以開始使用',
    'auth.email': '電子郵件',
    'auth.password': '密碼',
    'auth.displayName': '顯示名稱',
    'auth.emailPlaceholder': 'your@email.com',
    'auth.passwordPlaceholder': '輸入您的密碼',
    'auth.displayNamePlaceholder': '您的名字',
    'auth.loading': '載入中...',
    'auth.noAccount': '還沒有帳戶？立即註冊',
    'auth.hasAccount': '已經有帳戶？登入',
    'auth.loginSuccess': '登入成功！',
    'auth.welcomeBack': '歡迎回來！',
    'auth.signupSuccess': '帳戶已建立！',
    'auth.checkEmail': '請檢查您的電子郵件以確認您的帳戶',
    'auth.error': '錯誤',
    'auth.logout': '登出',
    'auth.myAccount': '我的帳戶',
    
    // Buyer Profiles
    'buyers.title': '精選餐飲採購',
    'buyers.subtitle': '與來自領先餐飲企業的專業買家建立聯繫',
    'buyers.experience': '採購經驗',
    'buyers.years': '年',
    'buyers.rating': '滿意度',
    'buyers.expertise': '產品專長',
    'buyers.markets': '經驗市場',
    'buyers.brands': '合作品牌',
  },
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>('en');

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations.en] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
