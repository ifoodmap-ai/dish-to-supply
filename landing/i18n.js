(function (root, factory) {
  var i18n = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = i18n;
  }

  if (root) {
    root.IfmI18n = i18n;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  var LANGS = ['zh', 'en'];
  var DEFAULT_LANG = 'zh';
  var STORAGE_KEY = 'ifm.lang';

  /* ==== DICT:BEGIN ====
     中英文案字典。markup 用 {{ L.xxx.yyy }} 綁定,程式碼用 IfmI18n.dict(lang)。
     zh 與 en 的 key 結構必須完全一致 —— tests/i18n.test.cjs 會擋。
     改文案就直接改這裡。 */
  var DICT = {
    "zh": {
      "nav": {
        "logoAlt": "iFoodmap 食材地圖",
        "mainNavLabel": "主要導覽",
        "menuLabel": "選單",
        "findIngredients": "找食材",
        "becomeSupplier": "成為供應商",
        "features": "平台功能",
        "faq": "常見問題",
        "about": "關於我們",
        "news": "最新消息",
        "contact": "聯絡我們",
        "cta": "填寫食材需求",
        "skipToContent": "跳到主要內容"
      },
      "home": {
        "heroTitlePre": "免費找到",
        "heroTitlePost": "",
        "heroSubA": "餐廳、團膳、學校、團購主都適用。",
        "heroSubB": "填一次需求，供應商主動來找你。",
        "searchAriaLabel": "搜尋食材",
        "searchPlaceholder": "搜尋食材，例如：有機葉菜、火鍋肉片",
        "searchButton": "搜尋",
        "audienceTitleA": "任何有食材需求的人，",
        "audienceTitleB": "都適用",
        "audienceSub": "不只是餐廳。只要需要進貨，我們就幫你找到對的供應商。",
        "flowTitlePre": "從需求到進貨，",
        "flowTitleHighlight": "一條龍",
        "flowCta": "立即填寫食材需求",
        "categoriesTitle": "食材分類",
        "categoriesSub": "從產地、工廠、大盤到小盤商",
        "problemTitleA": "過去找食材，",
        "problemTitleB": "永遠是那幾家",
        "problemBody": "同行介紹、上網搜尋，資訊卻不齊全；想詢價、想確認配送區域，留了聯絡方式往往好幾天沒有回覆。食材地圖把需求送到對的供應商手上，讓他們主動聯繫你。",
        "problemCta": "了解運作方式",
        "testimonialsTitle": "使用者怎麼說",
        "quoteOpen": "「",
        "quoteClose": "」",
        "bylineSep": "　",
        "newsTitle": "餐飲相關資訊",
        "newsAll": "全部文章 →",
        "ctaTitleA": "免費找到所有食材，",
        "ctaTitleB": "從填一張需求單開始",
        "ctaPrimary": "填寫食材需求",
        "ctaSecondary": "免費註冊會員",
        "data": {
          "rotating": [
            "所有食材",
            "對的供應商",
            "第二家報價",
            "產地直送的好貨"
          ],
          "hotTags": [
            "蔬菜",
            "水果",
            "豬肉",
            "牛肉",
            "火鍋料",
            "米麵"
          ],
          "heroPromises": [
            "完全免費",
            "成交不抽成",
            "平均 4 小時有回覆"
          ],
          "stats": [
            "合作供應商（示意）",
            "累積媒合需求（示意）",
            "食材分類",
            "配送涵蓋"
          ],
          "statsNationwide": "全台",
          "audiences": [
            {
              "title": "餐廳・餐酒館",
              "desc": "小量也能問，換供應商不必重新累積人脈。"
            },
            {
              "title": "團膳・學校",
              "desc": "大量、穩定、需要文件？一次找齊符合資格的供應商。"
            },
            {
              "title": "團購主・電商",
              "desc": "找源頭貨、找代工，談量談價都從這裡開始。"
            },
            {
              "title": "加工廠・通路",
              "desc": "原料穩定供應，備援廠商一次備齊。"
            }
          ],
          "flow": [
            {
              "title": "填需求",
              "desc": "品項、數量、配送區域，2 分鐘。"
            },
            {
              "title": "系統媒合",
              "desc": "只發給供得起、送得到的廠商。"
            },
            {
              "title": "收到報價",
              "desc": "平均 4 小時開始收到回覆。"
            },
            {
              "title": "比較洽談",
              "desc": "價格、配送、標章一次比。"
            },
            {
              "title": "下單進貨",
              "desc": "直接和供應商成交，不抽成。"
            },
            {
              "title": "雙邊評價",
              "desc": "好廠商被更多人看見。"
            }
          ],
          "categories": [
            "蔬菜",
            "水果",
            "海鮮",
            "肉品",
            "蛋品",
            "五穀雜糧",
            "南北雜貨",
            "加工食品",
            "火鍋料",
            "調味品",
            "酒與飲品",
            "包材耗材"
          ],
          "pains": [
            "上網搜尋永遠是那幾家，資訊也不齊全",
            "留了聯絡方式，好幾天等不到回覆",
            "不確定對方配不配送我的區域",
            "想比價，卻沒有第二、第三家可以問"
          ],
          "testimonials": [
            {
              "who": "林老闆",
              "role": "日式餐廳・台北",
              "quote": "以前換一家蔬菜商要問三個月，這裡填完需求隔天就有三家報價。"
            },
            {
              "who": "陳主任",
              "role": "國小午餐團膳",
              "quote": "需要產銷履歷的供應商很難找，這邊可以直接篩選有標章的廠商。"
            },
            {
              "who": "王小姐",
              "role": "生鮮團購主",
              "quote": "終於直接談到產地，不必再透過中間商加價。"
            }
          ],
          "trust": [
            {
              "title": "雙邊評價機制",
              "desc": "媒合完成後互相評價，讓優質供應商被更多人看見。"
            },
            {
              "title": "標章與檢驗連動",
              "desc": "產銷履歷、SGS 檢驗報告附上文件連結，可連至認證機構查核。"
            },
            {
              "title": "LINE 即時通知",
              "desc": "新供應商、食材優惠與媒合結果，第一時間通知你。"
            }
          ],
          "articlesTop": [
            {
              "tag": "採購",
              "title": "如何做好餐飲食材採購：從規格書到驗收"
            },
            {
              "tag": "食安",
              "title": "了解產銷履歷，加入溯源餐廳的行列"
            },
            {
              "tag": "趨勢",
              "title": "使用在地食材，邁向從產地到餐桌"
            }
          ],
          "askPrefix": "我想找食材："
        }
      },
      "rest": {
        "caps": {
          "cost": {
            "costLabel": "香煎雞腿食材成本",
            "costRatio": "成本占比 31.8%",
            "itemSpec": "去骨雞腿 2 kg",
            "li1": "查看菜色食材成本與成本占比",
            "li2": "進行供應商價格比較，掌握報價差異",
            "li3": "需要調整時，查看替代食材與當季參考",
            "mockTag": "成本比較",
            "r1Supplier": "安心食材",
            "r2Supplier": "產地鮮配",
            "scrollAria": "成本比較示意表，可左右捲動",
            "sub": "把菜色食材成本與供應商報價放在相同脈絡中，讓採購決策有清楚依據。",
            "tableAria": "供應商價格比較示例",
            "th1": "供應商",
            "th2": "品項規格",
            "th3": "單價",
            "th4": "更新日",
            "title": "成本與採購"
          },
          "menuAi": {
            "fileAction": "檢視結果",
            "fileName": "夏季午餐菜單.pdf",
            "fileStatus": "已完成辨識 · 等待確認",
            "li1": "辨識菜色與食材，建立可編輯的菜單結構",
            "li2": "確認或編輯分析結果，補上用量與單位",
            "li3": "從菜色回到實際採購需求",
            "mockTag": "菜單分析",
            "r1Dish": "季節時蔬",
            "r1Ing": "青花菜、紅蘿蔔",
            "r1Status": "已確認",
            "r2Dish": "香煎雞腿",
            "r2Ing": "去骨雞腿",
            "r2Status": "待編輯",
            "scrollAria": "菜單分析示意表，可左右捲動",
            "sub": "上傳菜單後整理菜色與食材，先由系統協助辨識，再由使用者確認內容。",
            "tableAria": "菜單分析示例",
            "th1": "菜色",
            "th2": "辨識食材",
            "th3": "用量",
            "title": "AI 菜單分析"
          },
          "mockLabel": "產品功能示意畫面 · 示例資料",
          "orders": {
            "badge": "配送中",
            "eta": "預計 07/27 上午送達",
            "ev1Sub": "準備送往總店收貨區",
            "ev1Title": "供應商已出貨",
            "ev2Sub": "共 8 個品項",
            "ev2Title": "餐廳已確認訂單",
            "li1": "集中查看採購與訂單狀態",
            "li2": "到貨後由團隊確認收貨",
            "li3": "保留不可覆寫的事件履歷，釐清每次狀態異動",
            "mockTag": "訂單詳情",
            "orderNo": "訂單 #R-0726-018",
            "sub": "從採購到到貨保留一致狀態，讓負責下單與現場收貨的人都看得到最新進度。",
            "title": "訂單與收貨"
          },
          "sectionAria": "餐廳產品功能",
          "team": {
            "li1": "管理分店與團隊成員",
            "li2": "設定 owner、manager、purchaser 角色",
            "li3": "維護各分店收貨地點與時段",
            "mockTag": "團隊與分店",
            "r1Location": "總店",
            "r1Member": "王店長",
            "r2Location": "總店、東區店",
            "r2Member": "陳採購",
            "recvDetail": "台北市中山區 · 週一至週六 08:00–11:00",
            "recvTitle": "總店收貨設定",
            "scrollAria": "團隊權限示意表，可左右捲動",
            "statusActive": "啟用",
            "sub": "依分店與職責安排帳號角色，讓採購、管理與收貨的人取得適合的操作範圍。",
            "tableAria": "團隊權限示例",
            "th1": "成員",
            "th2": "分店",
            "th3": "角色",
            "title": "團隊管理"
          },
          "thStatus": "狀態"
        },
        "cases": {
          "c1": {
            "body": "透過一次需求媒合，快速對接三家蔬果供應商，穩定取得當季食材。",
            "stat1Label": "完成供應商比較",
            "stat1Value": "3 天",
            "stat2Label": "食材採購成本",
            "tag": "餐廳業者",
            "title": "單店餐廳，告別到處問價的日子"
          },
          "c2": {
            "body": "同時對接多家供應商，降低單一來源斷貨風險，供餐更有保障。",
            "stat1Label": "穩定合作供應商",
            "stat2Label": "斷貨次數",
            "tag": "團膳業者",
            "title": "大量供餐，採購來源更穩定"
          },
          "eyebrow": "成果案例",
          "sub": "成果依業態、採購規模與執行期間而異。",
          "title": "餐廳採購的實際成果"
        },
        "cta": {
          "sub": "建立餐廳帳號，開始整理菜單、供應商與採購訂單。",
          "title": "讓下一次採購，從清楚的流程開始"
        },
        "ctaCreateAccount": "建立餐廳帳號",
        "flow": {
          "eyebrow": "日常工作流程",
          "s1": {
            "body": "上傳菜單，或直接整理要採購的食材。",
            "title": "整理菜單與需求"
          },
          "s2": {
            "body": "檢查品項、用量與單位，再交由團隊使用。",
            "title": "確認食材與規格"
          },
          "s3": {
            "body": "集中查看合作供應商與品項報價。",
            "title": "比較供應商與價格"
          },
          "s4": {
            "body": "追蹤進度，到貨後由團隊完成確認。",
            "title": "建立訂單並確認收貨"
          },
          "sub": "每一步都由團隊確認，保留清楚的採購依據與進度。",
          "title": "從菜單與需求，一路走到收貨"
        },
        "hero": {
          "ctaSecondary": "查看餐廳功能",
          "kpiPendingLabel": "待收貨",
          "kpiPendingValue": "6 筆",
          "kpiSpendLabel": "本月採購",
          "kpiSuppliersLabel": "合作供應商",
          "kpiSuppliersValue": "12 家",
          "mockAria": "餐廳營運總覽產品示意畫面",
          "mockTag": "示例資料",
          "mockTitle": "餐廳營運總覽",
          "progressCount": "4 / 6 已完成",
          "progressTitle": "今日採購進度",
          "sub": "把菜單、食材成本、供應商比較、採購訂單與團隊權限放在清楚的工作流程中，讓每天的採購更容易掌握。",
          "task1": "確認明日蔬菜需求",
          "task1Status": "已完成",
          "task2": "海鮮訂單收貨",
          "task2Status": "待處理",
          "title": "從菜單分析到完成收貨，都在同一個平台"
        },
        "pain": {
          "compare": {
            "body": "詢價結果散落各處，整理與確認往往占去採購時間。",
            "title": "比價耗費大量時間"
          },
          "eyebrow": "採購現場",
          "manual": {
            "body": "找新食材或供應商時，常得逐一打電話、問同行。",
            "title": "仰賴人工與同行詢問"
          },
          "specs": {
            "body": "品項、單位與報價格式不同，難以直接判斷差異。",
            "title": "規格與價格資訊不完整"
          },
          "sub": "當資訊分散在電話、訊息與試算表裡，團隊很難快速做出一致的採購決定。",
          "title": "餐廳採購，不該靠人脈與零散訊息",
          "track": {
            "body": "下單、到貨與異動缺少共同紀錄，交接容易遺漏。",
            "title": "訂單與收貨難追蹤"
          }
        }
      },
      "sup": {
        "heroTitle": "從商品上架到商機、報價與出貨",
        "heroSub": "把商品目錄、餐廳需求、報價、訂單與客戶經營放進同一套工作流程。你保留每一次判斷，平台協助整理資訊與追蹤進度。",
        "applyCta": "申請供應商上架",
        "heroCtaSecondary": "查看供應商功能",
        "demoTitle": "今日營運摘要",
        "demoSample": "示例資料",
        "demoBadge": "供應商工作台",
        "demoKpiLeadsLabel": "新商機",
        "demoKpiLeadsValue": "8 筆",
        "demoKpiQuotesLabel": "待報價",
        "demoKpiQuotesValue": "3 筆",
        "demoKpiOrdersLabel": "待確認訂單",
        "demoKpiOrdersValue": "2 筆",
        "demoMatchTitle": "最新匹配需求",
        "demoMatchBadge": "新商機",
        "demoMatchItem": "葉菜類 120 kg · 台北市",
        "demoMatchDetail": "每週配送 3 次 · 希望 08:00 前送達",
        "painEyebrow": "供應商常見挑戰",
        "painTitle": "好商品，不該埋沒在零散詢價裡",
        "painSub": "當需求、報價與合作紀錄散落在不同對話裡，回覆速度和後續經營都更難掌握。",
        "painScatteredTitle": "需求分散，難以及時發現",
        "painScatteredDesc": "商機可能來自多個管道，品項與服務區域也得逐一確認。",
        "painQuotesTitle": "報價與交期反覆確認",
        "painQuotesDesc": "價格、付款條件和替代品項容易在訊息往返中遺漏。",
        "painPricingTitle": "定價缺少市場依據",
        "painPricingDesc": "不容易看見同區同品項行情與近期需求變化。",
        "painRetentionTitle": "客戶回購狀況難掌握",
        "painRetentionDesc": "完成交易後，還需要持續整理下單頻率與合作狀況。",
        "flowEyebrow": "一條清楚的接單流程",
        "flowTitle": "從被看見，到報價、接單與持續經營",
        "flowSub": "先建立可媒合的商品資料，再逐步處理商機、訂單與客戶關係。",
        "flowCatalogTitle": "建立商品目錄",
        "flowCatalogDesc": "整理供應品項、價格與服務範圍。",
        "flowLeadsTitle": "接收匹配商機",
        "flowLeadsDesc": "查看與商品目錄相符的餐廳需求。",
        "flowQuoteTitle": "回覆報價並確認訂單",
        "flowQuoteDesc": "填寫報價條件，追蹤已接受與待確認項目。",
        "flowShipTitle": "出貨並累積客戶關係",
        "flowShipDesc": "確認出貨，回看訂單、客戶與評價紀錄。",
        "cap1Eyebrow": "01 · 找到合適需求",
        "cap1Title": "商機雷達",
        "cap1Sub": "平台依餐廳需求、商品目錄與服務區域整理潛在商機，你可以查看狀態並自行決定下一步。",
        "cap1Li1": "依商品目錄進行需求單自動媒合",
        "cap1Li2": "查看新商機與不同處理狀態",
        "cap1Li3": "用近 90 天需求做品項缺口分析",
        "cap2Eyebrow": "02 · 報價到出貨",
        "cap2Title": "報價與接單",
        "cap2Sub": "集中檢視需求、回覆報價並追蹤採購訂單；每個確認動作仍由供應商操作。",
        "cap2Li1": "回覆報價金額、交期、付款條件與替代品項",
        "cap2Li2": "查看待報價、已報價與已接受狀態",
        "cap2Li3": "追蹤待確認訂單，完成後確認出貨",
        "cap3Eyebrow": "03 · 看懂行情與需求",
        "cap3Title": "定價與預測",
        "cap3Sub": "用平台既有報價與需求資料作為參考，檢視價格競爭力和近期備貨方向。",
        "cap3Li1": "比對同區同品項行情與價格名次",
        "cap3Li2": "查看近 13 週需求量趨勢",
        "cap3Li3": "依近 90 天資料取得下週備貨建議與產季提示",
        "cap4Eyebrow": "04 · 延續合作關係",
        "cap4Title": "客戶經營",
        "cap4Sub": "完成訂單後，系統依合作紀錄整理客戶輪廓，並集中呈現評價與服務指標。",
        "cap4Li1": "查看餐廳下單頻率、累計金額與回購狀況",
        "cap4Li2": "辨識可能流失客戶，作為主動聯繫參考",
        "cap4Li3": "整理交易評價、商店評價與星等分布",
        "outcomesEyebrow": "平台規模與使用情境",
        "outcomesTitle": "供應商經營的成果參考",
        "outcomesSub": "以下分開呈現平台現有公開數據與產品示例，避免把操作畫面誤認為特定客戶實績。",
        "statLabel": "平台現有公開數據",
        "stat1Desc": "在地供應商",
        "stat2Value": "28 類",
        "stat2Desc": "食材品項分類",
        "stat3Desc": "平均媒合回應",
        "outcomesNoteLabel": "示例資料，非特定客戶實績",
        "outcomesNoteBody": "一個完整工作日可依序查看新商機、回覆待報價需求、確認訂單與出貨，再用客戶與評價紀錄安排後續聯繫。",
        "outcomesDisclaimer": "成果依品項、服務區域、供應能力與執行期間而異。",
        "ctaTitle": "讓下一個合適商機，更容易看見你",
        "ctaSub": "申請供應商上架，開始建立商品目錄與服務範圍。"
      },
      "cases": {
        "heroTitle": "餐廳與供應商，如何一起改善採購成果",
        "heroSub": "從需求媒合、供應來源到食材履歷，以下案例呈現不同業態在各自採購情境中的改善層級。",
        "resultsEyebrow": "已核准案例成果",
        "resultsTitle": "依角色與改善層級比較",
        "resultsNote": "數據為個別案例結果，用來說明採購情境，不代表所有使用者都會得到相同成果。",
        "case1": {
          "visualAlt": "供應商比較流程示意",
          "step1": "提出需求",
          "step2": "取得報價",
          "step3": "完成比較",
          "eyebrow": "餐廳端成果 · 採購效率與成本",
          "title": "單店餐廳，告別到處問價的日子",
          "body": "透過一次需求媒合，快速對接三家蔬果供應商，穩定取得當季食材。",
          "stat1Value": "3 天",
          "stat1Label": "完成供應商比較",
          "stat2Label": "食材採購成本"
        },
        "case2": {
          "visualAlt": "多來源供應狀態示意",
          "step1": "蔬果供應",
          "step2": "肉品供應",
          "step3": "備援來源",
          "eyebrow": "餐廳端成果 · 供應穩定度",
          "title": "大量供餐，採購來源更穩定",
          "body": "同時對接多家供應商，降低單一來源斷貨風險，供餐更有保障。",
          "stat1Label": "穩定合作供應商",
          "stat2Label": "斷貨次數"
        },
        "case3": {
          "visualAlt": "履歷資訊與顧客信任示意",
          "step1": "產地資訊",
          "step2": "履歷資料",
          "step3": "顧客回饋",
          "eyebrow": "供應商合作成果 · 履歷與信任",
          "title": "產地直送，建立消費者信任",
          "body": "對接具產銷履歷的產地供應商，商品故事與品質都更有說服力。",
          "stat1Label": "回購率提升",
          "stat2Label": "顧客評價"
        },
        "disclaimer": "成果依業態、採購規模與執行期間而異。",
        "ctaRestaurant": "餐廳註冊",
        "ctaSupplier": "供應商上架"
      },
      "about": {
        "heroTitle": "讓餐廳需求與供應能力，更有效率地相遇",
        "heroBody": "iFoodmap 是連結餐廳與食材供應商的雙邊 B2B 食材採購平台。餐廳可以整理需求、比較報價並管理採購；供應商可以呈現商品、回覆商機並持續經營客戶關係。",
        "valueEyebrow": "雙邊共同價值",
        "valueTitle": "讓資訊沿著採購流程流動",
        "valueBody": "同一個平台承接雙方需要的資訊層級，減少需求、報價、訂單與出貨散落在不同管道。",
        "forRestaurantsLabel": "給餐廳",
        "forRestaurantsTitle": "更清楚地提出需求與做決策",
        "forRestaurantsBody": "從菜單、品項與規格開始，逐步比較供應來源、價格與訂單狀態。",
        "forSuppliersLabel": "給供應商",
        "forSuppliersTitle": "更有效率地找到商機與服務客戶",
        "forSuppliersBody": "依商品與服務範圍接收需求，集中處理報價、訂單、出貨與客戶紀錄。",
        "valuesEyebrow": "我們重視的事",
        "valuesTitle": "三個核心價值",
        "value1Title": "高效媒合",
        "value1Body": "用資料與 AI 協助雙方整理條件，讓每一次採購更快找到合適的合作對象。",
        "value2Title": "公平透明",
        "value2Body": "讓需求、規格、報價與服務紀錄有清楚脈絡，幫助雙方在資訊對等下做決策。",
        "value3Title": "在地永續",
        "value3Body": "串接台灣在地供應鏈，縮短產地、供應端與餐桌之間的資訊距離。"
      },
      "contact": {
        "heroTitle": "找到適合你的平台入口或聯絡方式",
        "heroBody": "餐廳可以直接建立帳號，供應商可以申請上架；一般商務諮詢與食材需求也可以由客服協助。",
        "roleGridLabel": "平台角色入口",
        "roleRestaurantTitle": "我是餐廳",
        "roleRestaurantAction": "建立餐廳帳號 →",
        "roleSupplierTitle": "我是供應商",
        "roleSupplierAction": "申請供應商上架 →",
        "phoneIcon": "電",
        "phoneLabel": "服務專線",
        "emailLabel": "電子信箱",
        "hoursIcon": "時",
        "hoursLabel": "服務時間",
        "hoursValue": "週一至週五 9:00 – 18:00",
        "lineLabel": "官方 LINE",
        "lineValue": "加入好友即時諮詢",
        "aiTitle": "直接跟 AI 採購助手說",
        "aiHelp": "不用填表。說一句你要找什麼，助手會問清楚品項、數量、配送區域與時程，再把需求送給合適的供應商。",
        "aiCta": "開始對話，免費媒合 →",
        "aiHint": "也可以直接上傳菜單照片，讓它幫你整理採購清單。",
        "aiQuickLabel": "常見需求，點一下開始"
      },
      "footer": {
        "brandTagline": "食材地圖",
        "phoneLabel": "服務專線",
        "hoursLabel": "服務時間",
        "hoursValue": "週一至週五 9:00–18:00",
        "serviceFindIngredients": "找食材",
        "serviceBecomeSupplier": "成為供應商",
        "servicePlatformFeatures": "平台功能",
        "serviceLogin": "登入平台",
        "companyAbout": "關於我們",
        "companyCases": "成功案例",
        "companyNews": "最新消息",
        "companyContact": "聯絡我們",
        "supportFaq": "常見問題",
        "supportTerms": "使用條款",
        "supportPrivacy": "隱私權政策",
        "sep": "｜"
      },
      "meta": {
        "siteName": "iFoodmap 食材地圖",
        "keywords": "食材採購,餐飲供應鏈,供應商媒合,B2B 食材,餐廳進貨,食材地圖,ifoodmap,AI 採購,產地直送",
        "author": "iFoodmap 食材地圖",
        "langSwitchLabel": "切換語言",
        "langSwitchToEn": "English",
        "langSwitchToZh": "中文",
        "pages": {
          "home": {
            "title": "iFoodmap 食材地圖｜餐廳與供應商的 B2B 食材採購平台",
            "description": "iFoodmap 以 AI 串接餐廳需求與全台食材供應商，整合智慧媒合、報價比較、訂單、出貨與採購管理。"
          },
          "restaurants": {
            "title": "餐廳方案｜從菜單分析到完成收貨，都在同一個平台 - iFoodmap 食材地圖",
            "description": "整理食材需求、比較供應商報價、追蹤訂單與收貨，還有 AI 菜單分析與成本試算。餐廳採購的每一步都在同一個工作流程裡。"
          },
          "suppliers": {
            "title": "供應商方案｜從商品上架到商機、報價與出貨 - iFoodmap 食材地圖",
            "description": "上架商品目錄、接收餐廳需求、回覆報價並經營客戶關係。iFoodmap 幫供應商把資訊整理好，每一次判斷仍然由你決定。"
          },
          "cases": {
            "title": "成功案例｜餐廳與供應商如何一起改善採購成果 - iFoodmap 食材地圖",
            "description": "單店餐廳、團膳供餐、生鮮團購在各自採購情境中的改善成果，從需求媒合、供應來源到食材履歷。"
          },
          "about": {
            "title": "關於我們｜讓餐廳需求與供應能力更有效率地相遇 - iFoodmap 食材地圖",
            "description": "iFoodmap 是連結餐廳與食材供應商的雙邊 B2B 食材採購平台，讓資訊沿著採購流程流動。"
          },
          "contact": {
            "title": "聯絡我們｜跟 AI 採購助手說需求，或申請供應商上架 - iFoodmap 食材地圖",
            "description": "餐廳可以直接建立帳號、供應商可以申請上架。食材需求交給 AI 採購助手問清楚，平台再送給合適的供應商，需求方完全免費。"
          }
        }
      },
      "ai": {
        "fabLabel": "開啟 AI 採購助手",
        "title": "iFoodMap AI 採購助手",
        "subtitle": "上傳菜單或描述需求，立即整理採購清單",
        "closeLabel": "關閉",
        "inputSrLabel": "輸入食材需求",
        "uploadLabel": "上傳菜單照片",
        "inputPlaceholder": "輸入你的食材需求…",
        "sendLabel": "送出",
        "dropHint": "放開以上傳菜單 📷",
        "ctaButton": "送出免費媒合 →",
        "greeting": "嗨！我是 iFoodMap AI 採購助手 👋\n你可以：\n📷 上傳一張菜單照片，我幫你整理出採購食材清單\n💬 或直接打字描述你需要的食材",
        "errService": "AI 服務暫時忙線，請稍後再試 🙏 你也可以直接留下聯絡方式，由專人為你免費媒合。",
        "ctaPrefixChat": "需要的話，我可以幫你把需求送給專人免費媒合 👇",
        "ctaPrefixAnalysis": "採購清單整理好了！要我們幫你免費媒合供應商嗎？",
        "uploadImageOnly": "請上傳圖片檔（JPG / PNG）。",
        "dropImageOnly": "請拖曳圖片檔（JPG / PNG）。",
        "menuImageAlt": "菜單",
        "analysisFallback": "AI 已分析出你的採購需求：",
        "askName": "好的！為了幫你免費媒合，請問怎麼稱呼您？😊",
        "placeholderName": "請輸入您的姓名…",
        "askPhone": "謝謝 {name}！方便留下您的手機嗎？我們會請專人盡快與您聯繫 📱",
        "placeholderPhone": "請輸入您的手機…",
        "phoneInvalid": "手機號碼看起來不太完整，可以再給我一次嗎？例如 0912-345-678",
        "sending": "送出中…",
        "leadSuccess": "✓ 收到了，{name}！我們會盡快用手機 {phone} 與您聯繫，為您免費媒合最合適的供應商 🙌",
        "leadFailure": "送出失敗，請稍後再試一次 🙏"
      }
    },
    "en": {
      "nav": {
        "logoAlt": "iFoodmap",
        "mainNavLabel": "Main navigation",
        "menuLabel": "Menu",
        "findIngredients": "Find Ingredients",
        "becomeSupplier": "Become a Supplier",
        "features": "How It Works",
        "faq": "FAQ",
        "about": "About",
        "news": "News",
        "contact": "Contact",
        "cta": "Post a Request",
        "skipToContent": "Skip to main content"
      },
      "home": {
        "heroTitlePre": "Find ",
        "heroTitlePost": " at no cost",
        "heroSubA": "For restaurants, catering operations, schools, and group-buying hosts.",
        "heroSubB": "Submit one request and suppliers come to you.",
        "searchAriaLabel": "Search ingredients",
        "searchPlaceholder": "Search ingredients, e.g. organic greens, hot pot meat",
        "searchButton": "Search",
        "audienceTitleA": "Built for anyone who",
        "audienceTitleB": "sources ingredients",
        "audienceSub": "Not just restaurants. If you buy ingredients, we'll connect you with the right suppliers.",
        "flowTitlePre": "Request to restock, ",
        "flowTitleHighlight": "end to end",
        "flowCta": "Post Your Request",
        "categoriesTitle": "Ingredient Categories",
        "categoriesSub": "From farms and factories to wholesalers and local distributors",
        "problemTitleA": "Sourcing used to mean",
        "problemTitleB": "the same few suppliers",
        "problemBody": "Referrals and web searches leave you with incomplete information. You ask for a quote or check whether they deliver to your area, leave your contact details, and then hear nothing for days. iFoodmap routes your request to the right suppliers so they reach out to you.",
        "problemCta": "See How It Works",
        "testimonialsTitle": "What Users Say",
        "quoteOpen": "“",
        "quoteClose": "”",
        "bylineSep": " · ",
        "newsTitle": "Food Service Insights",
        "newsAll": "All articles →",
        "ctaTitleA": "Find every ingredient at no cost.",
        "ctaTitleB": "It starts with one request.",
        "ctaPrimary": "Post a Request",
        "ctaSecondary": "Create an Account",
        "data": {
          "rotating": [
            "every ingredient",
            "the right supplier",
            "a second quote",
            "farm-direct quality"
          ],
          "hotTags": [
            "Vegetables",
            "Fruit",
            "Pork",
            "Beef",
            "Hot Pot",
            "Rice & Noodles"
          ],
          "heroPromises": [
            "No cost to buyers",
            "Zero commission",
            "Avg. 4-hour reply"
          ],
          "stats": [
            "Partner suppliers (illustrative)",
            "Requests matched (illustrative)",
            "Ingredient categories",
            "Delivery coverage"
          ],
          "statsNationwide": "Nationwide",
          "audiences": [
            {
              "title": "Restaurants & Bistros",
              "desc": "Small orders welcome. Switch suppliers without rebuilding your network."
            },
            {
              "title": "Catering & Schools",
              "desc": "High volume, steady supply, full documentation — qualified suppliers in one pass."
            },
            {
              "title": "Group Buying & E-Commerce",
              "desc": "Source direct or find contract manufacturers. Volume and pricing talks start here."
            },
            {
              "title": "Processors & Distributors",
              "desc": "Lock in steady raw-material supply and line up backup vendors."
            }
          ],
          "flow": [
            {
              "title": "Submit a request",
              "desc": "Items, volume, delivery area — 2 minutes."
            },
            {
              "title": "We match",
              "desc": "Sent only to suppliers who can stock it and deliver it."
            },
            {
              "title": "Get quotes",
              "desc": "Replies start arriving in about 4 hours."
            },
            {
              "title": "Compare & negotiate",
              "desc": "Weigh price, delivery, and certifications side by side."
            },
            {
              "title": "Order & restock",
              "desc": "Deal directly with the supplier. We take no commission."
            },
            {
              "title": "Two-way reviews",
              "desc": "Good suppliers get seen by more buyers."
            }
          ],
          "categories": [
            "Vegetables",
            "Fruit",
            "Seafood",
            "Meat",
            "Eggs",
            "Grains & Cereals",
            "Dry Goods & Pantry Staples",
            "Processed Foods",
            "Hot Pot Ingredients",
            "Seasonings",
            "Beverages & Alcohol",
            "Packaging & Supplies"
          ],
          "pains": [
            "Web searches turn up the same few names, with incomplete details",
            "You leave your contact details and wait days for a reply",
            "No way to tell whether they deliver to your area",
            "You want to compare prices but have no second or third supplier to ask"
          ],
          "testimonials": [
            {
              "who": "Mr. Lin",
              "role": "Japanese restaurant, Taipei",
              "quote": "Switching produce suppliers used to take three months of asking around. Here I filed a request and had three quotes the next day."
            },
            {
              "who": "Director Chen",
              "role": "Elementary school lunch program",
              "quote": "Suppliers with traceability certification are hard to find. Here I can filter for certified vendors directly."
            },
            {
              "who": "Ms. Wang",
              "role": "Fresh-food group-buying host",
              "quote": "I finally deal with growers directly, without a middleman's markup."
            }
          ],
          "trust": [
            {
              "title": "Two-way reviews",
              "desc": "Buyers and suppliers rate each other after every match, so strong suppliers get more visibility."
            },
            {
              "title": "Certifications and lab reports linked",
              "desc": "Traceability certification (TAP) and SGS lab reports come with document links you can verify with the issuing body."
            },
            {
              "title": "LINE instant alerts",
              "desc": "Be the first to know about new suppliers, ingredient deals, and match results."
            }
          ],
          "articlesTop": [
            {
              "tag": "Procurement",
              "title": "Better Food Procurement: From Spec Sheet to Acceptance"
            },
            {
              "tag": "Food Safety",
              "title": "Traceability Certification (TAP) and Becoming a Traceable Restaurant"
            },
            {
              "tag": "Trends",
              "title": "Local Sourcing: Moving Toward Farm to Table"
            }
          ],
          "askPrefix": "I'm looking for: "
        }
      },
      "rest": {
        "caps": {
          "cost": {
            "costLabel": "Ingredient cost · Pan-seared chicken",
            "costRatio": "Cost ratio 31.8%",
            "itemSpec": "Boneless chicken thigh 2 kg",
            "li1": "See ingredient cost and cost ratio for every dish",
            "li2": "Compare supplier pricing and see exactly where quotes differ",
            "li3": "Check substitute ingredients and seasonal references when you need to adjust",
            "mockTag": "Cost comparison",
            "r1Supplier": "Anxin Foods",
            "r2Supplier": "FarmDirect Fresh",
            "scrollAria": "Cost comparison sample table, scrolls horizontally",
            "sub": "Put dish-level ingredient costs next to supplier quotes, so purchasing decisions rest on real numbers.",
            "tableAria": "Supplier price comparison example",
            "th1": "Supplier",
            "th2": "Item & spec",
            "th3": "Unit price",
            "th4": "Updated",
            "title": "Costing & Purchasing"
          },
          "menuAi": {
            "fileAction": "View results",
            "fileName": "Summer Lunch Menu.pdf",
            "fileStatus": "Analyzed · Awaiting confirmation",
            "li1": "Detect dishes and ingredients, and build an editable menu structure",
            "li2": "Confirm or edit the results, and fill in quantities and units",
            "li3": "Turn dishes back into actual purchasing requirements",
            "mockTag": "Menu analysis",
            "r1Dish": "Seasonal vegetables",
            "r1Ing": "Broccoli, carrot",
            "r1Status": "Confirmed",
            "r2Dish": "Pan-seared chicken thigh",
            "r2Ing": "Boneless chicken thigh",
            "r2Status": "Needs edit",
            "scrollAria": "Menu analysis sample table, scrolls horizontally",
            "sub": "Upload a menu and the system drafts the dishes and ingredients for your team to review and confirm.",
            "tableAria": "Menu analysis example",
            "th1": "Dish",
            "th2": "Detected ingredients",
            "th3": "Quantity",
            "title": "AI Menu Analysis"
          },
          "mockLabel": "Product mockup · Sample data",
          "orders": {
            "badge": "In transit",
            "eta": "Arriving 07/27, morning",
            "ev1Sub": "En route to the main store receiving bay",
            "ev1Title": "Supplier shipped",
            "ev2Sub": "8 items total",
            "ev2Title": "Restaurant confirmed order",
            "li1": "Track purchasing and order status in one place",
            "li2": "Let the team confirm receipt when goods arrive",
            "li3": "Keep an append-only event history that explains every status change",
            "mockTag": "Order detail",
            "orderNo": "Order #R-0726-018",
            "sub": "One consistent status from order to delivery, so whoever places the order and whoever receives it see the same progress.",
            "title": "Orders & Receiving"
          },
          "sectionAria": "Restaurant product capabilities",
          "team": {
            "li1": "Manage locations and team members",
            "li2": "Set owner, manager and purchaser roles",
            "li3": "Maintain receiving addresses and time windows for each location",
            "mockTag": "Team & locations",
            "r1Location": "Main store",
            "r1Member": "Wang (store manager)",
            "r2Location": "Main store, East branch",
            "r2Member": "Chen (buyer)",
            "recvDetail": "Zhongshan District, Taipei · Mon–Sat 08:00–11:00",
            "recvTitle": "Main store receiving setup",
            "scrollAria": "Team permissions sample table, scrolls horizontally",
            "statusActive": "Active",
            "sub": "Assign account roles by location and responsibility, so buyers, managers and receiving staff each get the right access.",
            "tableAria": "Team permissions example",
            "th1": "Member",
            "th2": "Location",
            "th3": "Role",
            "title": "Team Management"
          },
          "thStatus": "Status"
        },
        "cases": {
          "c1": {
            "body": "A single round of matching connected them with three produce suppliers and a steady flow of seasonal ingredients.",
            "stat1Label": "to compare suppliers",
            "stat1Value": "3 days",
            "stat2Label": "ingredient purchasing cost",
            "tag": "Restaurant operator",
            "title": "A single-location restaurant stops chasing quotes"
          },
          "c2": {
            "body": "Sourcing from several suppliers at once cut single-source stockout risk and kept service reliable.",
            "stat1Label": "steady supplier partners",
            "stat2Label": "stockouts",
            "tag": "Institutional caterer",
            "title": "High-volume catering on a steadier supply base"
          },
          "eyebrow": "Results",
          "sub": "Results vary by business type, purchasing volume and time frame.",
          "title": "Real results from restaurant buyers"
        },
        "cta": {
          "sub": "Create a restaurant account and start organizing menus, suppliers and purchase orders.",
          "title": "Start your next order with a clear process"
        },
        "ctaCreateAccount": "Create restaurant account",
        "flow": {
          "eyebrow": "Daily workflow",
          "s1": {
            "body": "Upload a menu, or just list the ingredients you need to buy.",
            "title": "Capture menus and needs"
          },
          "s2": {
            "body": "Check items, quantities and units before the team works from them.",
            "title": "Confirm ingredients and specs"
          },
          "s3": {
            "body": "See your suppliers and their item quotes in one place.",
            "title": "Compare suppliers and prices"
          },
          "s4": {
            "body": "Track progress, then have the team confirm goods on arrival.",
            "title": "Place orders and confirm receipt"
          },
          "sub": "Your team confirms every step, leaving a clear record of what was ordered and why.",
          "title": "From menu and demand through to receiving"
        },
        "hero": {
          "ctaSecondary": "See features",
          "kpiPendingLabel": "Awaiting delivery",
          "kpiPendingValue": "6 orders",
          "kpiSpendLabel": "Spend this month",
          "kpiSuppliersLabel": "Active suppliers",
          "kpiSuppliersValue": "12",
          "mockAria": "Product mockup: restaurant operations overview",
          "mockTag": "Sample data",
          "mockTitle": "Operations overview",
          "progressCount": "4 / 6 done",
          "progressTitle": "Today's purchasing",
          "sub": "Menus, ingredient costs, supplier comparisons, purchase orders and team permissions in one clear workflow, so daily purchasing stays under control.",
          "task1": "Confirm tomorrow's produce needs",
          "task1Status": "Done",
          "task2": "Receive seafood order",
          "task2Status": "Pending",
          "title": "From menu analysis to receiving, all in one platform"
        },
        "pain": {
          "compare": {
            "body": "Quotes end up scattered, and pulling them together eats most of the buyer's day.",
            "title": "Comparing quotes eats the day"
          },
          "eyebrow": "On the ground",
          "manual": {
            "body": "Finding a new ingredient or supplier means calling around and asking other operators.",
            "title": "Manual research and word of mouth"
          },
          "specs": {
            "body": "Items, units and quote formats all differ, so there's no clean way to compare them side by side.",
            "title": "Incomplete specs and pricing"
          },
          "sub": "When information is spread across phone calls, chat threads and spreadsheets, teams can't make consistent purchasing decisions quickly.",
          "title": "Purchasing shouldn't run on contacts and scattered messages",
          "track": {
            "body": "Orders, deliveries and changes have no shared record, so details slip during handoffs.",
            "title": "Orders and deliveries are hard to track"
          }
        }
      },
      "sup": {
        "heroTitle": "From catalog to leads, quotes, and delivery",
        "heroSub": "Bring your catalog, restaurant demand, quotes, orders, and customer relationships into one workflow. Every call is still yours to make; the platform organizes the information and tracks the progress.",
        "applyCta": "Apply as a Supplier",
        "heroCtaSecondary": "See supplier features",
        "demoTitle": "Today's operations",
        "demoSample": "Sample data",
        "demoBadge": "Supplier workspace",
        "demoKpiLeadsLabel": "New leads",
        "demoKpiLeadsValue": "8",
        "demoKpiQuotesLabel": "Awaiting quote",
        "demoKpiQuotesValue": "3",
        "demoKpiOrdersLabel": "Orders to confirm",
        "demoKpiOrdersValue": "2",
        "demoMatchTitle": "Latest matched request",
        "demoMatchBadge": "New lead",
        "demoMatchItem": "Leafy greens 120 kg · Taipei City",
        "demoMatchDetail": "3 deliveries a week · Arrive before 08:00",
        "painEyebrow": "Common supplier challenges",
        "painTitle": "Good products shouldn't get lost in scattered inquiries",
        "painSub": "When requests, quotes, and account history sit in separate conversations, both response time and follow-up get harder to control.",
        "painScatteredTitle": "Demand is scattered and easy to miss",
        "painScatteredDesc": "Leads arrive through several channels, and every item and service area has to be checked one at a time.",
        "painQuotesTitle": "Quotes and lead times take endless back-and-forth",
        "painQuotesDesc": "Pricing, payment terms, and substitute items get lost in long message threads.",
        "painPricingTitle": "Pricing without market reference",
        "painPricingDesc": "It's hard to see what comparable items go for nearby, or how demand has shifted recently.",
        "painRetentionTitle": "Repeat business is hard to track",
        "painRetentionDesc": "After a deal closes, order frequency and account status still have to be tracked by hand.",
        "flowEyebrow": "One clear path to orders",
        "flowTitle": "From getting found to quoting, closing, and keeping the account",
        "flowSub": "Start with product data that can be matched, then work through leads, orders, and customer relationships.",
        "flowCatalogTitle": "Build your catalog",
        "flowCatalogDesc": "Organize the items you supply, your pricing, and your service area.",
        "flowLeadsTitle": "Receive matched leads",
        "flowLeadsDesc": "See restaurant requests that match your catalog.",
        "flowQuoteTitle": "Quote and confirm orders",
        "flowQuoteDesc": "Submit your terms, then track what's accepted and what's still pending.",
        "flowShipTitle": "Ship and build the relationship",
        "flowShipDesc": "Confirm shipment, then review order, customer, and rating history.",
        "cap1Eyebrow": "01 · Find the right demand",
        "cap1Title": "Lead radar",
        "cap1Sub": "The platform matches restaurant requests against your catalog and service area and lays out the leads. You review the status and decide what to do next.",
        "cap1Li1": "Automatic matching between requests and your catalog",
        "cap1Li2": "Track new leads and where each one stands",
        "cap1Li3": "Spot catalog gaps from the last 90 days of demand",
        "cap2Eyebrow": "02 · Quote to delivery",
        "cap2Title": "Quotes and orders",
        "cap2Sub": "Review requests, send quotes, and track purchase orders in one place. Every confirmation is still made by the supplier.",
        "cap2Li1": "Quote price, lead time, payment terms, and substitute items",
        "cap2Li2": "See what's pending, quoted, and accepted",
        "cap2Li3": "Track orders awaiting confirmation, then confirm shipment",
        "cap3Eyebrow": "03 · Read the market",
        "cap3Title": "Pricing and forecasting",
        "cap3Sub": "Use existing quote and demand data on the platform as a reference for how competitive your pricing is and what to stock next.",
        "cap3Li1": "Compare your price against the local range and see where you rank",
        "cap3Li2": "Review demand volume over the last 13 weeks",
        "cap3Li3": "Get next-week stocking suggestions and seasonality notes from the last 90 days",
        "cap4Eyebrow": "04 · Keep the account growing",
        "cap4Title": "Customer management",
        "cap4Sub": "After an order closes, the platform builds a customer profile from your history together and brings ratings and service metrics into one view.",
        "cap4Li1": "See each restaurant's order frequency, lifetime value, and repeat rate",
        "cap4Li2": "Flag customers at risk of churn so you can reach out first",
        "cap4Li3": "Collect transaction ratings, store reviews, and star distribution",
        "outcomesEyebrow": "Platform scale and use cases",
        "outcomesTitle": "What supplier results look like",
        "outcomesSub": "Public platform figures and product mockups are shown separately, so a UI example is never mistaken for one customer's actual results.",
        "statLabel": "Public platform figures",
        "stat1Desc": "Local suppliers",
        "stat2Value": "28",
        "stat2Desc": "Ingredient categories",
        "stat3Desc": "Average match response",
        "outcomesNoteLabel": "Sample data, not a specific customer's results",
        "outcomesNoteBody": "A full working day can run straight through: review new leads, answer open quote requests, confirm orders and shipments, then use customer and rating records to plan follow-up.",
        "outcomesDisclaimer": "Results vary by product category, service area, supply capacity, and how long you have been active.",
        "ctaTitle": "Make it easier for the next good lead to find you",
        "ctaSub": "Apply as a supplier and start building your catalog and service area."
      },
      "cases": {
        "heroTitle": "How restaurants and suppliers improve sourcing together",
        "heroSub": "From demand matching and supply sources to ingredient traceability, these cases show what different types of operations improved within their own sourcing context.",
        "resultsEyebrow": "Approved case results",
        "resultsTitle": "Compared by role and level of improvement",
        "resultsNote": "Figures are individual case results, shown to illustrate sourcing scenarios. They are not a guarantee that every user will see the same outcome.",
        "case1": {
          "visualAlt": "Illustration of the supplier comparison process",
          "step1": "Post request",
          "step2": "Receive quotes",
          "step3": "Finish comparison",
          "eyebrow": "Restaurant outcome · Sourcing speed and cost",
          "title": "A single-site restaurant stops chasing quotes",
          "body": "One matching request connected them with three produce suppliers and a steady supply of seasonal ingredients.",
          "stat1Value": "3 days",
          "stat1Label": "To compare suppliers",
          "stat2Label": "Ingredient sourcing cost"
        },
        "case2": {
          "visualAlt": "Illustration of multi-source supply status",
          "step1": "Produce supply",
          "step2": "Meat supply",
          "step3": "Backup sources",
          "eyebrow": "Restaurant outcome · Supply reliability",
          "title": "Institutional catering with steadier sourcing",
          "body": "Working with several suppliers at once cut the risk of a single source running out, so every service stayed covered.",
          "stat1Label": "Steady supplier partners",
          "stat2Label": "Stockouts"
        },
        "case3": {
          "visualAlt": "Illustration of traceability data and customer trust",
          "step1": "Origin details",
          "step2": "Traceability records",
          "step3": "Customer feedback",
          "eyebrow": "Supplier outcome · Traceability and trust",
          "title": "Farm-direct supply that earns customer trust",
          "body": "Sourcing from farms with traceability certification (TAP) made both the product story and the quality claim more convincing.",
          "stat1Label": "Repeat purchase rate",
          "stat2Label": "Customer rating"
        },
        "disclaimer": "Results vary by business type, sourcing volume, and time in use.",
        "ctaRestaurant": "Restaurant sign-up",
        "ctaSupplier": "List as supplier"
      },
      "about": {
        "heroTitle": "Where restaurant demand meets supply capability",
        "heroBody": "iFoodmap is a two-sided B2B sourcing platform that connects restaurants with ingredient suppliers. Restaurants organize requirements, compare quotes, and manage purchasing; suppliers present their products, respond to opportunities, and keep building customer relationships.",
        "valueEyebrow": "Value for both sides",
        "valueTitle": "Keep information moving through the sourcing process",
        "valueBody": "One platform carries the level of detail both sides need, so requests, quotes, orders, and shipments stop scattering across separate channels.",
        "forRestaurantsLabel": "For restaurants",
        "forRestaurantsTitle": "State requirements clearly and decide with confidence",
        "forRestaurantsBody": "Start from your menu, items, and specs, then compare supply sources, pricing, and order status step by step.",
        "forSuppliersLabel": "For suppliers",
        "forSuppliersTitle": "Find opportunities and serve customers efficiently",
        "forSuppliersBody": "Receive requests matched to your catalog and service area, and handle quotes, orders, shipments, and customer records in one place.",
        "valuesEyebrow": "What we stand for",
        "valuesTitle": "Three core values",
        "value1Title": "Efficient matching",
        "value1Body": "Data and AI help both sides organize their requirements, so every purchase finds the right partner faster.",
        "value2Title": "Fair and transparent",
        "value2Body": "Requests, specs, quotes, and service history all stay on the record, so both sides decide with the same information.",
        "value3Title": "Locally sustainable",
        "value3Body": "We connect local supply chains nationwide (Taiwan) to shorten the distance between farm, supplier, and table."
      },
      "contact": {
        "heroTitle": "Find the right entry point, or just contact us",
        "heroBody": "Restaurants can create an account directly and suppliers can apply to list. For general business inquiries or ingredient requests, our team is here to help.",
        "roleGridLabel": "Platform entry points by role",
        "roleRestaurantTitle": "I'm a restaurant",
        "roleRestaurantAction": "Create a restaurant account →",
        "roleSupplierTitle": "I'm a supplier",
        "roleSupplierAction": "Apply to list as a supplier →",
        "phoneIcon": "T",
        "phoneLabel": "Service line",
        "emailLabel": "Email",
        "hoursIcon": "H",
        "hoursLabel": "Business hours",
        "hoursValue": "Mon–Fri 9:00 – 18:00",
        "lineLabel": "Official LINE",
        "lineValue": "Add us for instant support",
        "aiTitle": "Just tell our AI assistant",
        "aiHelp": "No forms. Say what you need and the assistant will work through the items, volume, delivery area and timing, then send your request to suppliers that fit.",
        "aiCta": "Start chatting — free →",
        "aiHint": "You can also upload a photo of your menu and let it build the sourcing list for you.",
        "aiQuickLabel": "Common requests — tap to start"
      },
      "footer": {
        "brandTagline": "Food Sourcing Map",
        "phoneLabel": "Service line",
        "hoursLabel": "Hours",
        "hoursValue": "Mon–Fri 9:00–18:00",
        "serviceFindIngredients": "Find ingredients",
        "serviceBecomeSupplier": "Become a supplier",
        "servicePlatformFeatures": "Platform features",
        "serviceLogin": "Log in",
        "companyAbout": "About us",
        "companyCases": "Case studies",
        "companyNews": "News",
        "companyContact": "Contact",
        "supportFaq": "FAQ",
        "supportTerms": "Terms of Service",
        "supportPrivacy": "Privacy Policy",
        "sep": ": "
      },
      "meta": {
        "siteName": "iFoodmap",
        "keywords": "food ingredient sourcing,restaurant supply chain,supplier matching,B2B ingredients,Taiwan food suppliers,ifoodmap,AI procurement,farm direct",
        "author": "iFoodmap",
        "langSwitchLabel": "Switch language",
        "langSwitchToEn": "English",
        "langSwitchToZh": "中文",
        "pages": {
          "home": {
            "title": "iFoodmap | B2B Ingredient Sourcing for Restaurants and Suppliers",
            "description": "iFoodmap uses AI to connect restaurant demand with ingredient suppliers across Taiwan, bringing matching, quote comparison, orders, delivery and purchasing into one platform."
          },
          "restaurants": {
            "title": "For Restaurants | From Menu Analysis to Receiving - iFoodmap",
            "description": "Organize ingredient requirements, compare supplier quotes, track orders and deliveries, with AI menu analysis and cost breakdowns. Every step of restaurant purchasing in one workflow."
          },
          "suppliers": {
            "title": "For Suppliers | From Catalog to Leads, Quotes and Delivery - iFoodmap",
            "description": "List your catalog, receive restaurant demand, respond with quotes and build customer relationships. iFoodmap organizes the information; every call is still yours to make."
          },
          "cases": {
            "title": "Case Studies | How Restaurants and Suppliers Improve Sourcing - iFoodmap",
            "description": "What single-location restaurants, institutional catering operations and fresh-produce group buyers improved within their own sourcing context."
          },
          "about": {
            "title": "About | Where Restaurant Demand Meets Supply Capability - iFoodmap",
            "description": "iFoodmap is a two-sided B2B sourcing platform connecting restaurants with ingredient suppliers, keeping information moving through the sourcing process."
          },
          "contact": {
            "title": "Contact | Tell our AI assistant what you need - iFoodmap",
            "description": "Restaurants can create an account and suppliers can apply to list. Tell our AI assistant what ingredients you need and we will send your request to suppliers that fit, at no cost to buyers."
          }
        }
      },
      "ai": {
        "fabLabel": "Open the AI sourcing assistant",
        "title": "iFoodMap AI Sourcing Assistant",
        "subtitle": "Upload a menu or describe your needs",
        "closeLabel": "Close",
        "inputSrLabel": "Describe your ingredient needs",
        "uploadLabel": "Upload a menu photo",
        "inputPlaceholder": "What ingredients do you need?",
        "sendLabel": "Send",
        "dropHint": "Drop to upload your menu 📷",
        "ctaButton": "Get matched free →",
        "greeting": "Hi, I'm the iFoodMap AI sourcing assistant 👋\nTwo ways to start:\n📷 Upload a photo of your menu and I'll turn it into a sourcing list\n💬 Or just type the ingredients you need",
        "errService": "The AI service is busy right now — please try again shortly 🙏 You can also leave your contact details and our team will match you with suppliers at no cost.",
        "ctaPrefixChat": "If you'd like, I can pass this to our team and they'll match you with suppliers at no cost 👇",
        "ctaPrefixAnalysis": "Your sourcing list is ready. Want us to match you with suppliers at no cost?",
        "uploadImageOnly": "Please upload an image file (JPG or PNG).",
        "dropImageOnly": "Please drop an image file (JPG or PNG).",
        "menuImageAlt": "Menu",
        "analysisFallback": "Here's what the AI found in your menu:",
        "askName": "Great. To set up your match, what's your name? 😊",
        "placeholderName": "Enter your name…",
        "askPhone": "Thanks, {name}. What's the best phone number to reach you? Our team will follow up shortly 📱",
        "placeholderPhone": "Enter your phone number…",
        "phoneInvalid": "That number looks incomplete — could you send it again? Example: +886 912 345 678",
        "sending": "Sending…",
        "leadSuccess": "✓ Got it, {name}. We'll reach you at {phone} shortly and match you with the right suppliers at no cost 🙌",
        "leadFailure": "Couldn't send that — please try again in a moment 🙏"
      }
    }
  };
  /* ==== DICT:END ==== */

  // 'zh-TW' / 'zh-Hant-TW' / 'ZH' → 'zh';'en-US' → 'en';其他 → null
  function normalizeLang(tag) {
    var value = String(tag == null ? '' : tag).trim().toLowerCase();
    if (!value) return null;
    for (var i = 0; i < LANGS.length; i++) {
      if (value === LANGS[i] || value.indexOf(LANGS[i] + '-') === 0) return LANGS[i];
    }
    return null;
  }

  // 瀏覽器語系:navigator.languages 是使用者在系統/瀏覽器排好的偏好順序,優先於 navigator.language。
  // 兩邊都沒有認得的語系(例如只設了日文)就回 null,交給呼叫端 fallback 到預設語系。
  function fromNavigator(win) {
    var nav = win && win.navigator;
    if (!nav) return null;
    var tags = [];
    var list = nav.languages;
    if (list && typeof list.length === 'number') {
      for (var i = 0; i < list.length; i++) tags.push(list[i]);
    }
    if (nav.language) tags.push(nav.language);
    for (var j = 0; j < tags.length; j++) {
      var match = normalizeLang(tags[j]);
      if (match) return match;
    }
    return null;
  }

  // localStorage 在無痕視窗/擋第三方儲存時會直接 throw,不是回 null —— 一定要包 try。
  function storedLang(win) {
    try {
      return normalizeLang(win.localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function storeLang(win, lang) {
    var value = normalizeLang(lang);
    if (!value) return false;
    try {
      win.localStorage.setItem(STORAGE_KEY, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  // 使用者按過語言鈕就聽他的;沒按過才看瀏覽器設定;都沒有就中文。
  function detect(win) {
    return storedLang(win) || fromNavigator(win) || DEFAULT_LANG;
  }

  function dict(lang) {
    return DICT[normalizeLang(lang) || DEFAULT_LANG] || DICT[DEFAULT_LANG];
  }

  // 反查:給一個寫死在程式裡的中文字面值,回傳它在其他語系的所有對應字串。
  // 為什麼需要 —— 有些 script 是靠「比對畫面上的文字」來做事的(例如缺圖佔位框換圖的對照表
  // IMG_MAP,key 就是佔位框裡那行中文)。畫面文字一旦跟著語系換掉,那些比對就會全部落空。
  // 同一個中文可能在字典裡出現多次、譯法不同,所以回傳陣列,呼叫端把每一種都註冊進去。
  var literalIndex = null;

  function indexLiterals(zhNode, enNode, out) {
    if (typeof zhNode === 'string') {
      if (typeof enNode !== 'string' || !zhNode) return;
      var bucket = out[zhNode] || (out[zhNode] = []);
      if (bucket.indexOf(enNode) === -1) bucket.push(enNode);
      return;
    }
    if (Array.isArray(zhNode)) {
      if (!Array.isArray(enNode)) return;
      for (var i = 0; i < zhNode.length; i++) indexLiterals(zhNode[i], enNode[i], out);
      return;
    }
    if (zhNode && typeof zhNode === 'object' && enNode && typeof enNode === 'object') {
      for (var key in zhNode) {
        if (Object.prototype.hasOwnProperty.call(zhNode, key)) indexLiterals(zhNode[key], enNode[key], out);
      }
    }
  }

  function translateAll(zhText) {
    if (!literalIndex) {
      literalIndex = {};
      indexLiterals(DICT.zh, DICT.en, literalIndex);
    }
    return Object.prototype.hasOwnProperty.call(literalIndex, zhText) ? literalIndex[zhText].slice() : [];
  }

  function other(lang) {
    return normalizeLang(lang) === 'en' ? 'zh' : 'en';
  }

  // 「現在是哪個語系」的唯一真相是網址(routing.js 的前綴),不是 localStorage ——
  // localStorage 只記「使用者按過什麼」,用來決定裸網址 / 要落在哪一版。
  function current(win) {
    var routing = win && win.IfmRouting;
    if (routing && typeof routing.pathToLang === 'function' && win.location) {
      return routing.pathToLang(win.location.pathname);
    }
    return detect(win);
  }

  // React 外面的東西(右下角 AI 助手、表單狀態訊息)沒有 state 可以重繪,
  // 靠這個事件自己去換字。
  var CHANGE_EVENT = 'ifm:langchange';

  function emitChange(win, lang) {
    var value = normalizeLang(lang);
    if (!win || !value || typeof win.dispatchEvent !== 'function') return false;
    try {
      win.dispatchEvent(new win.CustomEvent(CHANGE_EVENT, { detail: { lang: value } }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function onChange(win, handler) {
    if (!win || typeof win.addEventListener !== 'function') return function () {};
    var wrapped = function (event) { handler((event && event.detail && event.detail.lang) || current(win)); };
    win.addEventListener(CHANGE_EVENT, wrapped);
    return function () { win.removeEventListener(CHANGE_EVENT, wrapped); };
  }

  // 帶參數的句子:'謝謝 {name}！' → format(s, { name: '王小姐' })
  function format(template, params) {
    if (typeof template !== 'string' || !params) return template;
    return template.replace(/\{(\w+)\}/g, function (whole, key) {
      return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : whole;
    });
  }

  return {
    DEFAULT_LANG: DEFAULT_LANG,
    LANGS: LANGS,
    STORAGE_KEY: STORAGE_KEY,
    CHANGE_EVENT: CHANGE_EVENT,
    current: current,
    detect: detect,
    emitChange: emitChange,
    format: format,
    onChange: onChange,
    dict: dict,
    fromNavigator: fromNavigator,
    normalizeLang: normalizeLang,
    other: other,
    storeLang: storeLang,
    storedLang: storedLang,
    translateAll: translateAll,
    _dict: DICT,
  };
});
