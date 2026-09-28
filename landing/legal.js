(function (root, factory) {
  var legal = factory();
  if (typeof module === 'object' && module.exports) module.exports = legal;
  if (root) root.IfmLegal = legal;
})(typeof window !== 'undefined' ? window : null, function () {
  /* ==== 由 scripts/build-legal.mjs 從舊站 ifoodmap.com.tw/pages/code/ 擷取後產生,不要手改 ====
     中文版是原文逐字照抄(法律上有效力的版本),英文版是譯本。
     兩個語系共用同一個 slug,所以 /legal/x 與 /en/legal/x 是同一份文件,hreflang 才指得對。
     條號(第一條、一、)保留在文字裡,ol 用 list-style:none 呈現 —— 條號會被交叉引用
     (例如第九條提到「第十八條」),自動編號一旦跟原文對不上就是改了法律文件。 */
  var DOCS = [
    {
      "slug": "terms",
      "updated": "2023-10-30",
      "zh": {
        "title": "使用條款",
        "summary": "使用者、消費者與服務廠商使用食材地圖平台時所適用的契約條款。",
        "blocks": [
          {
            "type": "h2",
            "text": "使用條款及規則條款之接受及規範"
          },
          {
            "type": "p",
            "text": "以下所記載之相關條款及規則構成使用者、消費者、服務廠商與食材地圖平台間之法律合約關係，規範上開行為人間之權利義務關係，使用者、消費者及服務廠商如欲使用食材地圖平台提供之服務，即代表上開行為人同意以下之條款及規則。如果使用者、消費者及服務廠商不同意以下之條款及規則，則請使用者、消費者及服務廠商勿使用食材地圖平台所提供之服務，食材地圖平台亦保留在任何時間更新及修改下述任一條款及內容之權利，此外，食材地圖平台亦保留拒絕使用者、消費者及服務廠商使用食材地圖平台之權利。"
          },
          {
            "type": "h2",
            "text": "條款之修正"
          },
          {
            "type": "p",
            "text": "食材地圖平台無論在何時且無庸事先通知的情況下，保留其唯一任意修改此條款，以及任意引用使用者內容的權利。條款如有任何修正之情形，食材地圖平台將透過在食材地圖平台網站上發佈修正通知，或者在使用者、消費者或服務廠商登錄其註冊帳戶時，收到食材地圖平台訊息通知。修改之內容將在修改公告在食材地圖平台或發送修改通知給使用者、消費者或服務廠商七天後生效，以較早者為準。另如使用者、消費者或服務廠商在條款修改發布後或接收該通知七天後仍繼續使用食材地圖平台，將被視為同意條款之修改。使用者如果不同意條款之修改，將無法繼續使用食材地圖平台。"
          },
          {
            "type": "p",
            "text": "請完整查看食材地圖平台之條款及規則，對於食材地圖平台之使用將有明確之規範。食材地圖平台上針對特定產品或服務區域可能有不同的條款及條件，且或有可能將另行要求使用者、消費者或服務廠商另行同意並接受該附加條款及條件或政策。如果這些為特定產品或服務區域所另行發佈的條款與原先之條款及規則間存在衝突，則另行同意之條款將優先適用之。"
          },
          {
            "type": "h2",
            "text": "第一條：名詞定義"
          },
          {
            "type": "ol",
            "items": [
              "1.平台內容：指使用者內容及食材地圖平台內容。",
              "2.內容：指文本、圖形、圖像、影片，音樂、軟體、音訊、影像檔、資訊或其他素材，包括但不限於服務廠商資訊、服務項目需求、報價單、往返訊息、評價、預約時程和日曆資訊，以及透過食材地圖平台所提供之其他資訊或素材。",
              "3. 食材地圖平台:指食材地圖網站平台、行動裝置軟體、行動裝置ÅPP，或其他應用程式、軟體以供食材地圖平台提供服務或使用者使用服務。",
              "4.消費者：指註冊食材地圖平台帳戶之使用者，接受或請求服務項目報價，或以其他方式使用食材地圖平台所提供之服務，接受，評估，僱用或支付服務廠商提供之服務項目。",
              "5.服務廠商：指註冊食材地圖平台帳戶之使用者，針對服務項目發送報價單，或透過食材地圖平台提供服務項目或收取服務項目費用。",
              "6.使用者：指完成食材地圖平台帳戶註冊或通過食材地圖平台提交或接收服務請求的人員，包括但不限於服務廠商和消費者等客戶成員.",
              "7.服務項目：指由服務廠商所表列、報價、預定或提供之服務，或者是由消費者通過食材地圖平台所提出預約、請求或接受之服務。",
              "8.食材地圖平台內容：指食材地圖平台上所有使用之內容，包含任何文字及圖形，且應包括第三人許可的任何內容，但不包括使用者內容。",
              "9.使用者內容：指食材地圖平台的任何使用者透過食材地圖平台所提交、張貼、上傳、發佈或傳輸之內容，包括但不限於廠商服務資訊，評價，照片、檔案資訊、描述、張貼、審閱和經過食材地圖平台所進行的付款，但不包括食材地圖平台內容以及回饋內容（指第十八條：消費者之回饋及反應所提供之內容）。"
            ]
          },
          {
            "type": "h2",
            "text": "第二條：帳號設立"
          },
          {
            "type": "ol",
            "items": [
              "1.消費者及服務廠商如欲使用食材地圖平台所提供之服務配對服務，需先行於食材地圖平台申請註冊帳號，同意食材地圖平台規定之使用條款及規則，且需於註冊時提供食材地圖平台要求之使用者資料，以供食材地圖平台建立相關資料庫，供服務之配對。",
              "2.除消費者及服務廠商外，使用者可以在不註冊帳戶的情況下訪問使用食材地圖平台。但如果要使用食材地圖平台的某些功能時，食材地圖平台將會要求使用者註冊一個受密碼保護的帳戶。",
              "3.使用者同意在註冊食材地圖平台帳號時或提出服務需求過程中或在所有使用食材地圖平台之其他時間，皆提供準確、最新和完整的資訊，並於使用食材地圖平台過程中即時更新資訊以保持其準確性、最新性和完整性。使用者將完全負責維護自己的食材地圖平台密碼。使用者完全性自行負責食材地圖平台帳戶上所發生之任何行為，如有任何未經授權的使用情形出現時，使用者同意於發現後立即通知食材地圖平台。食材地圖平台對任何一方因未經授權而使用使用者之帳戶所造成的任何損失概不負責。如有任何上述非法使用情形出現，使用者同意承擔此種未經授權的使用致生食材地圖平台或其他人損失之損害賠償責任。"
            ]
          },
          {
            "type": "h2",
            "text": "第三條：使用資格"
          },
          {
            "type": "p",
            "text": "食材地圖平台僅同意年滿20歲之人方可以使用食材地圖平台之服務，使用者、消費者或服務廠商於食材地圖平台開設帳號或使用食材地圖平台所提供服務時，食材地圖平台即認定使用者、消費者及服務廠商均已年滿20歲，食材地圖平台毋庸再行驗證是否已滿20歲，且使用者、消費者及服務廠商同意依民法規定，負擔相關民事責任。"
          },
          {
            "type": "h2",
            "text": "第四條：服務之提供"
          },
          {
            "type": "p",
            "text": "藉由註冊或使用食材地圖平台提供、張貼或提供服務項目，服務廠商表示並保證他們以及為他們執行工作的受雇者、代理人、承包商和分包商，都是適合且完全符合資格、有經驗、具備執照、經認證的、具擔保、且已投保。根據適用法律或法規的要求，服務廠商得在法令管轄範圍內提供專業服務，且該服務與其正在執行的具體工作相關。"
          },
          {
            "type": "ol",
            "items": [
              "1.食材地圖平台為專業網路線上服務中介者，提供使用者透過網路及任何行動設備使用食材地圖平台之服務，服務廠商可透過食材地圖平台提供消費者服務項目，消費者可透過食材地圖平台提出服務項目之需求或指定與某位服務廠商聯繫。 食材地圖平台僅提供消費者的服務需求訊息予符合需求之服務廠商，如服務廠商認為可提供消費者所需之服務，服務廠商可透過食材地圖平台提供之資料向消費者進行服務項目報價，提案，協商之動作。倘消費者同意選擇與服務廠商合作，服務廠商將自行與消費者聯繫提供相關之服務，消費者將另行直接與服務廠商間成立其他民法規定之契約關係，並同意支付服務廠商所提供的服務項目費用，倘日後生相關爭議，消費者及服務廠商皆同意該民法契約行為爭議與食材地圖平台無涉，而自行尋求爭議解決之途徑。",
              "2.使用者皆明瞭並同意食材地圖平台僅提供此網路廣告媒介平台服務，本身並未提供任何服務，如有發生爭議皆屬使用者、消費者與服務廠商之間爭議，該爭議皆與食材地圖平台無涉，食材地圖平台無庸負擔任何相關責任。服務廠商知悉並同意，通過在食材地圖平台上註冊帳號後，服務廠商只能獲得透過使用食材地圖平台而對於接受服務項目感興趣之人之洽詢，包括但不限於提供消費者資訊，發送簡訊或安排工作預約等行為，進而達成提供專業服務。服務廠商知悉並同意，使用食材地圖平台並不保證任何食材地圖平台使用者將使用他們的服務項目。食材地圖平台亦不擔保服務廠商或消費者可於一定時間內配對成功且由服務廠商提供消費者完全滿意之服務或消費者自服務廠商處取得完全滿意之服務。",
              "3.服務廠商了解並同意他們是食材地圖平台之客戶，僅透過食材地圖平台提供服務給消費者，服務廠商並非屬食材地圖平台之員工、合資對象、合作夥伴或代理商。服務廠商知悉其應設定或確認自己的價格，使用自有之設備，並確定自己的工作時間表，工作相關內容皆與食材地圖平台無涉，食材地圖平台對於服務廠商所提供的服務 (包括服務廠商提供此類服務的方式)並不加以擔保及控制品質。",
              "4.食材地圖平台依適用之法律所允許，根據其公開有效獲得之報告，如服務廠商資料其中包含刑事定罪之紀錄，食材地圖平台得以可以限制、阻止、暫停、停用或根據此類檢查的結果取消服務廠商之帳戶。服務廠商同時同意並授權食材地圖平台可使用服務廠商之相關資訊，以便從服務廠商之供應商那裡獲得此類報告。"
            ]
          },
          {
            "type": "h2",
            "text": "第五條：使用平台的許可"
          },
          {
            "type": "p",
            "text": "在符合條款及規則之前提下，食材地圖平台授予使用者一個有限的、非獨佔的、可撤銷的、不可轉讓的和非專屬之許可，供以重製或顯示平台內容 (不包含所有軟體原始程式碼)，僅供使用者個人和非商業用途使用，且需與食材地圖平台使用用途相關。使用者不可使用、複製、改編、修改、分發、許可、銷售、轉移、公開展示、公開執行、傳輸、廣播或以其他方式開發平台或平台內容之衍生作品，除非在規則及條款有其他明確允許之情況下，方得為之。如果使用者下載或列印一份平台內容之副本供個人使用，則使用者必須保留該列印內容所涉及之著作權及其他專有通知提示。"
          },
          {
            "type": "h2",
            "text": "第六條：使用者內容"
          },
          {
            "type": "ol",
            "items": [
              "1. 食材地圖平台可以自行決定，允許使用者所張貼、上傳、發佈、提交或傳輸使用者內容。使用者如透過食材地圖平台提供使用者內容，同時亦指使用者授予食材地圖平台一個全球性的、不可撤銷的、永久的、非獨佔的、可轉讓的、免版稅的許可，並有權就使用者內容進行許可、使用、複製、調整、修改、分發、許可、出售、轉讓、公開展示、公開執行、傳輸、廣播、訪問、查看和以其他方式利用、市場推廣,但使用者之私人資訊和簡訊內容不會遭食材地圖平台在公眾廣告中使用。",
              "2.為了明確起見，使用者內容授予食材地圖平台之許可為無期限，與使用者註冊帳戶終止時間無關。但食材地圖平台這些條款都不會被視為或限制使用者使用和利用其擁有的使用者內容，包括張貼、上載、發佈，傳輸或減少等影響原本擁有的使用者內容的權利。",
              "3. 食材地圖平台保留權利，在任何時候亦無庸事先通知，無論基於任何理由或原因，如有任何可能違反條款之約定或其他有害於食材地圖平台或使用之情形，食材地圖平台具備唯一的酌處權，得任意刪除使用者內容或禁用其閱覽權限。"
            ]
          },
          {
            "type": "h2",
            "text": "第七條：收取之費用"
          },
          {
            "type": "p",
            "text": "食材地圖平台針對使用者、消費者及服務廠商收取之相關費用如下："
          },
          {
            "type": "ol",
            "items": [
              "1.消費者：消費者使用食材地圖平台提出使用服務需求時，食材地圖平台不向消費者收取任何費用。",
              "2.服務廠商：服務廠商使用食材地圖平台報價時，服務廠商同意先向食材地圖先行購買點數，食材地圖平台則以扣除服務廠商帳戶特定點數方式做為收取費用之代價。該點數無使用期限，可永久使用，然未使用之點數無法轉售，但可轉讓、退還或在扣除手續費後依比例退回現金。"
            ]
          },
          {
            "type": "h2",
            "text": "第八條：服務廠商購買點數及電子發票相關規定"
          },
          {
            "type": "p",
            "text": "服務廠商購買或獲取的點數可用於特定食材地圖平台上服務包括向消費者提出服務項目報價 (依以下報價點數之使用方式)。在扣點數前，我們將會以透明的方式讓服務廠商知道所需要的點數範圍或相對的現金範圍，用於特定平台功能。服務廠商了解購買食材地圖平台點數後，食材地圖平台的點數並無現金價值，一旦購買金額無法轉售。食材地圖點數無使用期限，但食材地圖平台不保證服務廠商能在一定時間內用完點數或有其他利用價值。如欲暸解服務項目及報價相關費用等事宜請至客服中心 。"
          },
          {
            "type": "ol",
            "items": [
              "1.報價點數之使用方式：食材地圖平台於消費者提出服務需求經資料庫配對後，食材地圖平台將主動寄送消費者需求之訊息給符合需求之服務廠商，此時食材地圖平台尚未將消費者之電話或電子信箱等聯絡方式提供給廠商，故食材地圖平台尚未於服務廠商帳戶扣除該服務需求所需特定點數，經服務廠商評估後願意對該消費者提出報價，經回報食材地圖平台後，食材地圖平台將寄發服務廠商報價通知給消費者，同時將消費者之聯絡方式（至少為電子信箱，電話則非必要）提供給廠商，食材地圖平台寄發報價同時，將依據該服務需求所需特定點數直接於服務廠商帳戶扣除點數。嗣後於消費者點閱讀取食材地圖平台傳送之報價訊息後，食材地圖平台將寄發讀取確認函給服務廠商以為確認，惟如消費者收到食材地圖平台寄送之報價訊息後48小時內未進行點閱讀取動作，則食材地圖平台，將主動在十四（14）個工作天內將已扣除之點數退還回服務廠商之帳戶。",
              "2.購買點數之支付方式：食材地圖平台針對服務廠商之市場付款處理服務，目前使用以下支付方式：星展銀行（提供國內信用卡付款功能、虛擬銀行帳號用以實體或網路ATM轉帳付款功能）等。服務廠商同意使用上開任一方式付款時，遵循上開任一支付方式約定之條款而受約束。服務廠商另同意提供食材地圖平台準確和完整的有關服務廠商之業務資訊，並授權食材地圖平台使用此資訊和交易記錄等付款相關的資訊。食材地圖平台有權更改支付方式，若需更動支付方式時食材地圖平台將於網站公告3日後實施。",
              "3.電子發票：不論透過任何工具方式支付購買食材地圖點數或扣款，食材地圖平台皆會於符合當地法令規定之狀態開立電子發票予付款人，食材地圖平台使用財政部電子發票整合服務平台開立發電子發票，購買後使用者將收到電子票通知， 食材地圖將不再寄發紙本發票。使用者同意食材地圖平台提供相關付款資訊給財政部電子發票整合服務平台，以利核發電子發票，同時同意遵守財政部電子發票整合服務平台相關條款。"
            ]
          },
          {
            "type": "h2",
            "text": "第九條：信用卡及海外消費手續費"
          },
          {
            "type": "p",
            "text": "服務廠商向食材地圖平台購買點數之計價單位雖為新台幣，因食材地圖平台為中華民國註冊之公司行號，故服務廠商使用信用卡或於海外購買點數時，除支付食材地圖平台之費用外，如選擇以國際信用卡支付或以跨國匯款方式購買點數之費用時，信用卡公司或銀行將視為海外消費，信用卡公司或銀行亦將收取相對應之海外消費或跨國轉帳手續費，每家信用卡公司或銀行收取之費用不同，請自行與支付費用之信用卡公司或銀行聯繫確認。"
          },
          {
            "type": "h2",
            "text": "第十條：擔保及聲明"
          },
          {
            "type": "ol",
            "items": [
              "1.使用者承諾提供給食材地圖平台之資訊皆為正確無誤，包括但不限於姓名、電話、地址或電子信箱等資訊，如使用者提供錯誤之訊息，導致食材地圖平台遭致相關之直接性或間接性損害，使用者同意負擔此損害以及所衍生之相關費用。",
              "2.食材地圖平台之使用者皆同意自行承擔風險，食材地圖平台並不保證或擔保使用者、服務廠商或消費者所提供之資料正確性，如有發生任何資料不正確之情事，食材地圖平台皆不負擔任何損害賠償責任。",
              "3.使用者皆擔保其提供食材地圖平台之所有資料均屬真實，無任何詐欺、虛偽、引人錯誤、誇大不實或有違反法令及公序良俗之情事；如有虛偽陳述之情事，致使用者或食材地圖平台任一方遭受損害，虛偽陳述者同意自行負擔相關損害賠償責任，食材地圖平台則免除任何損害賠償責任。",
              "4.使用者擔保針對食材地圖平台上或通過食材地圖平台所提供的使用者內容負責。使用者表示並保證:（1）使用者是所有使用者內容的唯一和專屬所有權人，使用者有權提供食材地圖平台使用，或者使用者擁有授予食材地圖所需的所有權、許可、同意和發佈等權限;（2）使用者內容或使用者透過食材地圖平台將使用者內容(或其任何部分)的使用、上傳、發佈、提交或傳送，都不得侵犯、挪用或違反協力廠商的專利、版權、商標、營業秘密、道德權利或其他專有或智慧財產權，或公開或隱私權的權利。或導致違反任何適用的法律或法規;（3）食材地圖平台可以校對、彙整或以其他方式編輯或撤回使用者內容，使用者並確保此類編輯的內容是準確的，並使使用者符合條款及規則所約定之陳述和保證。",
              "5.服務廠商提供之廣告、服務資訊、 報價或其他內容於食材地圖平台，如有任何違反中華民國法令之疑慮，食材地圖平台無庸經服務廠商同意，得直接下架該內容，服務廠商不得有任何異議。",
              "6.使用者同意食材地圖平台如發現任何使用者於食材地圖平台所張貼之內容出現辱罵性、傷害性、非法活動、種族歧視、猥褻、性騷擾、詆毀食材地圖平台或明顯造假等言論，食材地圖平台可任意編輯、調整或刪除，而無庸取得使用者之同意。",
              "7.使用者同意並擔保食材地圖平台及其股東、子公司、關係企業、董事、經理人、代理人、聯名廠商或其他合作夥伴及員工及為其抗辯，使其免於承擔因可歸責於使用者的下列事由所導致或相關之任何主張、行動、程序及訴訟，以及所有相關責任、損害、違約金、罰鍰、成本及費用 (包括但不限於其他糾紛調解費用)：（1）使用者違反或觸犯本服務條款的任何條款，或本服務條款所提及的任何政策或準則;（2）使用者使用或濫用本服務的行為;（3）使用者違反法律或侵害任何第三人權利。使用者並同意基於合法目的使用本服務，並會遵守本服務條款及所有適用法律、規定、守則、指令、準則、政策及規範。",
              "8.服務廠商應擔保其提供之服務及提供服務人員之資格皆符合中華民國政府法令一切規定，服務廠商應具備依法所需之任何政府核准證明或其他相關文件，如有任何違反中華民國法令規定之情形，致食材地圖平台遭行政機關課處罰鍰或其他法律處分，服務廠商同意無條件負責所有衍生之法律責任並負擔相關損害賠償責任。",
              "9.專業人士之免責聲明：食材地圖平台已採取相對應之措施盡力驗證提供專業服務人士之證照，然如其提供不實之資訊，導致食材地圖平台隨之提供該訊息給消費者，食材地圖平台無法承諾並確認該訊息之正確性及承擔相關之責任，故消費者就其提出相關專業服務之需求時，消費者同意自行於接受服務廠商之報價時，並於確認接受服務前向服務廠商請求提出相關證照。如消費者未自行向服務廠商確認相關證照致生損害時，消費者同意食材地圖平台無庸負擔任何責任。"
            ]
          },
          {
            "type": "h2",
            "text": "第十一條：個人資料保護"
          },
          {
            "type": "ol",
            "items": [
              "1. 使用者知悉並同意使用食材地圖平台時所輸入之任何個人資料，食材地圖皆有權於蒐集後任意加以利用並提供給相關服務廠商使用，無庸再經使用者之同意。",
              "2.服務廠商知悉並了解食材地圖平台所提供之使用者個人資料，皆以食材地圖平台名義進行蒐集、處理及利用，服務廠商僅得依食材地圖平台提供之資料於提供服務之必要範圍內進行個人資料之利用，並不得對使用者為任何行銷或其他個人資料利用之行為。",
              "3.服務廠商需遵守「個人資料保護法」及相關法令之規定，對於食材地圖平台所提供之使用者個人資料，皆應採取適當之安全措施，避免造成消費者之任何損害。",
              "4.若服務廠商違反「個人資料保護法」及相關法令規定或違反本合約任何規定，致生個人資料爭議者，服務廠商應即時通報食材地圖平台，並依食材地圖平台指示進行處理，服務廠商同意自行負擔相關法律責任，如導致食材地圖平台因而受有損害，並應賠償食材地圖平台相關損害。"
            ]
          },
          {
            "type": "h2",
            "text": "第十二條：保密義務"
          },
          {
            "type": "ol",
            "items": [
              "1.服務廠商因執行本合約而持有食材地圖平台提供之資訊，包括但不限於本合約內容、使用者之個人資料或其他未經公開揭露之資訊，應盡善良管理人之注意義務進行保密，除依本合約規定利用外，非經食材地圖平台事前書面同意，不得自行利用或洩漏前述未公開資訊予任何第三人。如服務廠商有對員工、顧問或其認為有必要之第三人揭露者，應使該等受揭露之對象受與本合約相當之保密義務。",
              "2.保密條約定不因本合約之解除、終止或屆滿而失其效力，至機密資訊非因可歸責於服務廠商之事由喪失其秘密性為止。食材地圖平台得隨時以書面通知服務廠商刪除或返還該機密資訊。"
            ]
          },
          {
            "type": "h2",
            "text": "第十三條：禁止事項"
          },
          {
            "type": "p",
            "text": "作為食材地圖之使用者，使用者同意不從事以下之行為:"
          },
          {
            "type": "ol",
            "items": [
              "1.使用他人的帳戶，錯誤陳述自己或通過食材地圖平台提供的服務項目，虛偽顯示身份或資格，在提供需求報價過程中錯誤陳述項目或其他資訊，或將服務項目張貼在食材地圖平台之不適當的分類項目中。",
              "2.使用任何自動化系統，包括但不限於機器人，離線閱讀器等設施，進行使用食材地圖平台而未經食材地圖平台之事先書面批准; 但是，如果公共搜尋引擎的營運商基於建置公開可搜索的材料索引時，則食材地圖平台同意可以使用機器人進行複製食材地圖平台上的資訊，但不能存檔此類材料，惟食材地圖平台保留在一般情況下或在特定的情況下撤銷這些例外之權利。",
              "3.以任何手動或自動方式複製受版權保護的內容，或以其他方式誤用或盜用食材地圖平台之資訊或內容，包括但不限於同質性、競爭性或協力廠商網站上使用。",
              "4.在一定之時間內，於食材地圖平台提出過多不合理之需求或該需求明顯非一般瀏覽器或人工所提出。",
              "5.採取任何可能不合理地毀壞食材地圖平台基礎設施的行為，例如：（1）干擾或企圖干擾食材地圖平台或第三方協力廠商的正常營運;（2）企圖閃避或繞過用於防止或限制進入食材地圖平台的措施;（3）繞過、使其無效或以其他方式干擾食材地圖平台的安全功能;（4）散佈可能損害食材地圖平台之病毒或任何其他技術;（5）使用食材地圖平台致侵害任何或第三方協力廠商的版權、營業秘密或其他權利，包括隱私權或宣傳權利。",
              "6.如為服務廠商，以任何方式規避應支付食材地圖平台費用購買點數之義務。",
              "7.從食材地圖平台收集個人可識別資料，包括但不限於名稱或其他帳戶資訊，或使用食材地圖平台提供的通信系統，卻非基於條款約定之用途使用，包括用於商業招募、徵才、廣告之目的。",
              "8.針對服務廠商或消費者提出招聘、徵才行為，以進行就業或求才為目的或任何不符合食材地圖平台目的的使用。",
              "9. 採取任何不適當或非法的行動，包括通過食材地圖平台提交不適當或非法的內容，包括騷擾、可恨、非法、褻瀆、淫穢、誹謗、威脅或歧視的內容，或提倡、促進或鼓勵不適當的活動，此可能被視為刑事犯罪的行為，或引起民事責任或違反任何法律的行為。",
              "10.違反任何食材地圖平台有關食材地圖平台之使用以及食材地圖平台與使用者間規則。",
              "11.廣告或徵求與食材地圖平台未設置或不符目的的服務項目，包括但不限於 （1）不屬於服務項目支援的類別或僅提供產品販賣的任何服務項目;（2）提供目錄或轉介;（3）提供貸款;（4）提供租用空間;（5）從事與食材地圖平台的業務競爭;（6）推廣或提供龐氏騙局、垃圾郵件或未經消費者主動邀求的商業內容等;（7）提供非合法之服務項目。",
              "12.從事任何可能損害審查或評分、評價、制度有效性或準確性之行為。",
              "13.服務廠商未按承諾執行服務項目，除非消費者未能實質執行雙方已同意的服務協定與條款或拒絕付款或出現明顯的錯誤，或者服務廠商無法驗證客戶的身份。",
              "14.從事欺詐行為。",
              "15.購買服務項目卻不符合消費者資格。",
              "16.進行任何活動或從事與食材地圖平台的業務或目的不符的行為。",
              "17.無真實需求或無付款意願下提出預購、請求、洽談或服務項目之需求。"
            ]
          },
          {
            "type": "h2",
            "text": "第十四條：特約事項"
          },
          {
            "type": "p",
            "text": "倘食材地圖平台發現服務廠商或消費者所註冊之帳戶，可能為競爭者所註冊且於使用食材地圖平台提供之媒介服務時，產生任何可能影響食材地圖平台營業業務之行為，食材地圖平台得無庸經帳號註冊者之同意，逕行停權並終止服務廠商或消費者與食材地圖平台間所成立之法律合約，倘該註冊帳號中尚有未使用之點數，食材地圖平台同意依帳戶使用者購買點數所支付之費用依剩餘點數比例退還相對應之費用。"
          },
          {
            "type": "h2",
            "text": "第十五條：智慧財產權"
          },
          {
            "type": "p",
            "text": "食材地圖平台網站上所有消費者或服務廠商可得觀看及使用之文字、圖形、編輯內容、圖表、設計、照片、影像、字體以及其他內容，皆屬食材地圖平台所有，並受到中華民國相關法令之保障，消費者及服務廠商不得未經食材地圖平台之事前書面同意，即任意加以重製或從事任何違反著作權法或商標法之行為。"
          },
          {
            "type": "h2",
            "text": "第十六條：免責事項"
          },
          {
            "type": "ol",
            "items": [
              "1.使用者、消費者及服務廠商同意在法律容許的最大限度內自行承擔使用食材地圖平台專業服務之相關風險。食材地圖平台依據使用者提供之資訊提供服務，食材地圖平台對於本服務不作任何明示、暗示或法定的擔保、主張或聲明，包括但不限於對於品質、效能、真實性準確性、完整性、無侵權或特定用途適用性之擔保，或於交易過程中按行業常規而衍生之擔保。在不受限上述條款之前提下，且在法律容許的最大限度內，食材地圖平台不保證提供本服務、本網站或其中所含功能，或該服務、網站或功能可隨時被確認、不會中斷、及時提供、安全可靠、正確、完整或無錯誤。食材地圖平台亦不對任何第三人之毀謗或非法行為負責，或因透過食材地圖平台所使用任何資料、資訊、素材、所遭致之任何損害而負責。此外，食材地圖平台不擔保網站平台之任何建議或資訊之正確性，無論口頭或書面資料。",
              "2.使用者、消費者及服務廠商知悉並同意食材地圖平台並無責任，且食材地圖平台不需任何理由即保有以下之權利（1）監測或審查使用者內容（2）基於法令允許之目的，對使用者，包括但不限於服務廠商及消費者，進行身份驗證、證照，犯罪背景及登記者之性別犯罪檢查。",
              "3.使用者完全自行承擔與食材地圖平台的其他使用者的所有通信和交互往來之相關責任，包括但不限於任何服務廠商、消費者、服務廠商之相關成員。使用者了解食材地圖平台不保證會驗證、審核或檢查食材地圖平台使用者的任何聲明與內容。食材地圖平台針對使用者的行為或與食材地圖平台的任何當前或未來使用者的相容性不作任何陳述或保證。使用者同意在與食材地圖平台的其他使用者間有關所有通信和交互往來中，所進行之任何交流自行採取合理的預防措施，特別是使用者決定離線或是親自會面以提供或接受專業服務。食材地圖平台對任何使用者或第三方協力廠商的任何行為或有所遺漏時所產生的所有責任皆不負責。",
              "4.食材地圖平台對於因使用或無法使用本網站或服務，所產生之全部風險或所造成之任何間接、附帶、特殊或衍生性之損害，皆不負擔損害賠償責任（無論是基於合約責任、侵權行為責任、產品責任或其他任何法律相關責任），亦不論食材地圖平台是否已獲悉此種損害之可能性。縱使條款所述之有限補救辦法未能達到以下之基本目的之補救，食材地圖平台亦可免責: （1）任何附帶的、特殊的相應的損害，包括利潤損失、資料丟失或商譽損失;（2）服務中斷、電腦損壞或系統故障;（3）替代品或服務的費用;（4）任何與本條款有關或與之有關的個人或身體傷害或情緒困擾而造成的任何損害;或（5）使用或無法使用該平台、專業服務或平台內容;（6）聯繫或接觸到任何與食材地圖平台的其他使用者或因使用食材地圖平台而交流或互動之其他人。"
            ]
          },
          {
            "type": "h2",
            "text": "第十七條：食材地圖平台之非承諾事項"
          },
          {
            "type": "p",
            "text": "食材地圖平台不是服務廠商、使用者或協力廠商之間任何協定成立下之任一方當事方。食材地圖平台所訂定之條款及規則或任何食材地圖平台內容的任何部分，包括但不限於任何計畫或其他服務，與使用者、消費者及服務廠商間並不構成代理、合夥、合資或就業等關係。食材地圖平台的任何成員或使用者均不得指揮或控制另一方的日常活動，或代表另一方承擔任何義務。條款及規則雖要求使用者需提供準確的資訊，且儘管食材地圖平台可以進行額外的檢查和測試，以驗證或檢查使用者的身份或背景，但食材地圖平台不作任何確認或認可任何使用者或其聲稱的身份或背景，無論他們使用任何服務項目。"
          },
          {
            "type": "p",
            "text": "在食材地圖平台上對使用者以某種方式獲得許可或信任的任何引用僅僅表明使用者已完成相關帳戶過程或符合使用者評審標準，並不代表任何其他內容之正確性及真實性且食材地圖平台亦不因此負擔任何其他額外之給付義務。任何此類描述都不構成食材地圖平台之認證或擔保，亦非指食材地圖平台已對使用者身份核實，也並非針對服務廠商之服務項目是否具有執照、保險、可信、安全或合適做出確信。任何此類相關資訊，僅用作便於使用者通過食材地圖平台尋找專業服務時針對服務廠商之身份和適用性進行評估。"
          },
          {
            "type": "h2",
            "text": "第十八條：使用者之回饋及反應"
          },
          {
            "type": "p",
            "text": "關於針對食材地圖平台服務之任何回饋、評論、問題或建議（以下統稱回饋內容），使用者保證：（1）有權披露相關回饋內容;（2）該回饋內容不侵犯任何其他人或實體的權利;（3）回饋內容不包含任何協力廠商或任何一方的機密或專有資訊。"
          },
          {
            "type": "p",
            "text": "藉由發送任何回饋內容之同時，使用者進一步 （1）同意食材地圖平台針對回饋內容沒有任何明示或暗示的保密義務;（2）授予食材地圖平台一個不可撤銷的、非獨家的、免版稅的、永久的、世界範圍的許可，藉以使用、修改、準備衍生作品、發佈、分發和授權回饋內容;（3）針對回饋內容同意放棄對食材地圖平台及其他使用者為任何道德權利的主張。"
          },
          {
            "type": "h2",
            "text": "第十九條：違反條款之處理"
          },
          {
            "type": "p",
            "text": "在不限制此處保留的任何其他權利的情況下，如使用者違反食材地圖平台所制定之政策或條款及規則時，食材地圖平台可自行決定採取法律允許的任何行為，包括但不限於刪除已張貼之使用者內容、限制使用者登入食材地圖平台之註冊帳戶、終止使用者帳戶、限制使用者之權限、並可能配合調查司法機構進行調查或起訴等事項。"
          },
          {
            "type": "h2",
            "text": "第二十條：帳戶之暫停或終止"
          },
          {
            "type": "p",
            "text": "使用者同意，食材地圖平台可以自行決定，無論有無任何原因，是否事先通知， 得在任何時候，決定限制、阻止、暫停、停用或取消使用者註冊帳戶全部或部分。另如使用者違反食材地圖平台條款及規則，食材地圖平台可為以下任何或全部行為且無庸事先通知或解釋: （1）使用者之註冊帳戶將被停用或暫停，且該帳戶之密碼將被禁用，使用者將無法再行登入食材地圖平台，且使用者內容亦可能被移除;（2）於一定狀況下，食材地圖平台可通知其他使用者，告知說明該帳戶已被終止、阻塞、暫停、停用或取消，以及採取此項行動之原因;（3）消費者同意其無權因帳戶終止而取消或延遲支付服務費用給服務廠商;（4）食材地圖平台並不會補償服務廠商因為帳號終止所造成的任何損失，包含服務項目取消或延遲之損失。使用者可以在任何時候取消對食材地圖平台之使用或終止已註冊之帳戶。如需終止帳戶請聯繫客服"
          },
          {
            "type": "p",
            "text": "惟請注意，當帳戶取消或終止後將，我們無責任刪除任何使用者所張貼到食材地圖平台之任何內容，包括但不限於任何評論。食材地圖平台亦希望使用者尊重中華民國智慧財產權相關法令，在適當的情況下，一旦使用者之帳戶有任何侵犯或被認為侵犯他人之智慧財產權時，食材地圖平台將逕行終止該使用者的帳戶。"
          },
          {
            "type": "h2",
            "text": "第二十一條：使用者間爭議"
          },
          {
            "type": "p",
            "text": "食材地圖平台重視所有的使用者，惟使用者間不免會發生爭執，由於食材地圖平台本身並不提供任何服務項目，故使用者同意於服務廠商提供服務項目發生任何爭執事項時，使用者間得直接依中華民國法令於爭議管轄地法院提起調解或訴訟而為紛爭解決之機制。使用者皆承認並同意食材地圖平台於紛爭解決案件中，僅扮演資料提供之角色，而非為紛爭解決案件之一方當事人，故食材地圖平台沒有義務參與該紛爭解決案件並協助紛爭之解決。"
          },
          {
            "type": "h2",
            "text": "第二十二條：準據法及管轄法院"
          },
          {
            "type": "p",
            "text": "本合約服務條款之解釋及適用，任一方如有涉及法律問題而與食材地圖間產生爭議或糾紛，使用者皆同意以台灣桃園地方法院為第一審管轄法院，並依照中華民國法律予以解釋處理。"
          },
          {
            "type": "h2",
            "text": "第二十三條：其他約定條款"
          },
          {
            "type": "ol",
            "items": [
              "1.不可抗力:除付款義務外, 無論是食材地圖平台還是使用者都無庸對另一方承擔因不可控制範圍所生之原因所產生的任何延遲或失敗的責任。這些原因包括但不限於火災、水災、地震、罷工、宣戰或未宣戰的戰爭、或國家災害等。",
              "2.整個協定:食材地圖平台所發佈的任何其他法律聲明或附加條款或政策，將構成使用者和食材地圖平台關於使用食材地圖平台整個協定。除本條明確說明外，如果有管轄權的法院認為該條款的任何規定有無效之情形，則該等條款無效情形並不影響其餘條款的有效性。",
              "3.免除權利:任一放棄權利之條款並不會被視為進一步或繼續放棄任何其他權利。另如食材地圖平台於任一條款下雖未作出的任何權利之主張，此時該權利並不會被視為放棄。",
              "4.連絡資訊:如果使用者對以上條款或食材地圖平台提供之服務有任何疑問，請聯繫客服"
            ]
          }
        ]
      },
      "en": {
        "title": "Terms of Use",
        "summary": "The contractual terms governing use of the iFoodmap platform by users, buyers and service providers.",
        "blocks": [
          {
            "type": "h2",
            "text": "Acceptance of and Compliance with the Terms of Use and Rules"
          },
          {
            "type": "p",
            "text": "The terms and rules set out below constitute the legal contract between users, buyers, service providers and the iFoodmap platform, and govern the rights and obligations among those parties. If a user, buyer or service provider wishes to use the services provided by the iFoodmap platform, that party is deemed to have agreed to the following terms and rules. If a user, buyer or service provider does not agree to the following terms and rules, that party should not use the services provided by the iFoodmap platform. The iFoodmap platform further reserves the right to update and amend any of the terms and content set out below at any time, and also reserves the right to refuse any user, buyer or service provider access to the iFoodmap platform."
          },
          {
            "type": "h2",
            "text": "Amendment of the Terms"
          },
          {
            "type": "p",
            "text": "The iFoodmap platform reserves the sole and unrestricted right to amend these terms and to quote user content at any time and without prior notice. In the event of any amendment to the terms, the iFoodmap platform will publish a notice of amendment on the iFoodmap platform website, or the user, buyer or service provider will receive a message notification from the iFoodmap platform when logging in to their registered account. Amendments take effect seven days after the notice of amendment is published on the iFoodmap platform or the notice of amendment is sent to the user, buyer or service provider, whichever is earlier. If a user, buyer or service provider continues to use the iFoodmap platform after the amendment is published or seven days after receiving such notice, that party is deemed to have agreed to the amendment. A user who does not agree to the amendment will be unable to continue using the iFoodmap platform."
          },
          {
            "type": "p",
            "text": "Please read the iFoodmap platform's terms and rules in full, as they set out clear rules governing use of the iFoodmap platform. Different terms and conditions may apply to particular products or service areas on the iFoodmap platform, and users, buyers or service providers may be separately required to agree to and accept such additional terms and conditions or policies. If the terms separately published for such particular products or service areas conflict with the original terms and rules, the separately agreed terms shall prevail."
          },
          {
            "type": "h2",
            "text": "Article 1: Definitions"
          },
          {
            "type": "ol",
            "items": [
              "1. Platform Content: means User Content and iFoodmap Platform Content.",
              "2. Content: means text, graphics, images, video, music, software, audio, image files, information or other material, including but not limited to service provider information, service requirements, quotations, correspondence, reviews, booking schedules and calendar information, as well as other information or material provided through the iFoodmap platform.",
              "3. iFoodmap Platform: means the iFoodmap website platform, mobile device software, mobile device app, or other applications or software through which the iFoodmap platform provides services or users use the services.",
              "4. Buyer: means a user who has registered an iFoodmap platform account and who accepts or requests quotations for service items, or who otherwise uses the services provided by the iFoodmap platform to accept, evaluate, engage or pay for service items provided by a service provider.",
              "5. Service Provider: means a user who has registered an iFoodmap platform account and who submits quotations for service items, or who provides service items or collects service item fees through the iFoodmap platform.",
              "6. User: means a person who has completed registration of an iFoodmap platform account or who submits or receives service requests through the iFoodmap platform, including but not limited to service providers, buyers and other customer members.",
              "7. Service Item: means a service listed, quoted, booked or provided by a service provider, or a service booked, requested or accepted by a buyer through the iFoodmap platform.",
              "8. iFoodmap Platform Content: means all content used on the iFoodmap platform, including any text and graphics, and shall include any content licensed from third parties, but excludes User Content.",
              "9. User Content: means content submitted, posted, uploaded, published or transmitted by any user of the iFoodmap platform through the iFoodmap platform, including but not limited to provider service information, reviews, photographs, file information, descriptions, postings, reviews and payments made through the iFoodmap platform, but excludes iFoodmap Platform Content and Feedback Content (meaning the content provided under Article 18: User Feedback and Responses)."
            ]
          },
          {
            "type": "h2",
            "text": "Article 2: Account Creation"
          },
          {
            "type": "ol",
            "items": [
              "1. A buyer or service provider wishing to use the matching services provided by the iFoodmap platform must first apply to register an account on the iFoodmap platform, agree to the terms of use and rules prescribed by the iFoodmap platform, and provide the user information required by the iFoodmap platform at the time of registration so that the iFoodmap platform may build the relevant database for service matching.",
              "2. Other than buyers and service providers, users may visit and use the iFoodmap platform without registering an account. However, in order to use certain features of the iFoodmap platform, the iFoodmap platform will require the user to register a password-protected account.",
              "3. The user agrees to provide accurate, current and complete information when registering an iFoodmap platform account, in the course of submitting service requirements, and at all other times when using the iFoodmap platform, and to update that information promptly while using the iFoodmap platform so as to keep it accurate, current and complete. The user is solely responsible for maintaining their own iFoodmap platform password. The user is solely responsible for any activity occurring on their iFoodmap platform account, and agrees to notify the iFoodmap platform immediately upon discovering any unauthorized use. The iFoodmap platform is not liable for any loss suffered by any party as a result of unauthorized use of a user's account. In the event of any such unlawful use, the user agrees to bear liability for damages caused to the iFoodmap platform or others by such unauthorized use."
            ]
          },
          {
            "type": "h2",
            "text": "Article 3: Eligibility"
          },
          {
            "type": "p",
            "text": "The iFoodmap platform permits only persons aged 20 or over to use the services of the iFoodmap platform. When a user, buyer or service provider opens an account on the iFoodmap platform or uses the services provided by the iFoodmap platform, the iFoodmap platform deems that the user, buyer and service provider are aged 20 or over, and the iFoodmap platform is not required to further verify whether they have reached the age of 20. Users, buyers and service providers agree to bear the relevant civil liability in accordance with the Civil Code."
          },
          {
            "type": "h2",
            "text": "Article 4: Provision of Services"
          },
          {
            "type": "p",
            "text": "By registering with or using the iFoodmap platform to offer, post or provide service items, service providers represent and warrant that they, and the employees, agents, contractors and subcontractors performing work on their behalf, are suitable and fully qualified, experienced, licensed, certified, bonded and insured. As required by applicable laws or regulations, service providers may provide professional services within the scope of the law, and such services must be relevant to the specific work they are performing."
          },
          {
            "type": "ol",
            "items": [
              "1. The iFoodmap platform is a professional online service intermediary providing users with access to the iFoodmap platform's services over the internet and on any mobile device. Service providers may provide service items to buyers through the iFoodmap platform, and buyers may submit requirements for service items or specify a particular service provider to contact through the iFoodmap platform. The iFoodmap platform only passes buyers' service requirement information to service providers who match those requirements. If a service provider considers that it can provide the service required by the buyer, the service provider may use the information supplied by the iFoodmap platform to submit a quotation, proposal or negotiation for the service item to the buyer. If the buyer agrees to work with the service provider, the service provider will contact the buyer directly to provide the relevant service, and the buyer will separately enter into a contractual relationship with the service provider under the Civil Code and agrees to pay the fees for the service items provided by the service provider. If any dispute subsequently arises, the buyer and the service provider both agree that such dispute under the Civil Code is unrelated to the iFoodmap platform and that they will seek resolution of the dispute themselves.",
              "2. All users understand and agree that the iFoodmap platform provides only this online advertising intermediary platform service and does not itself provide any services. Any dispute that arises is a dispute between users, buyers and service providers, is unrelated to the iFoodmap platform, and the iFoodmap platform bears no related liability. Service providers acknowledge and agree that, by registering an account on the iFoodmap platform, they obtain only enquiries from persons interested in receiving service items through use of the iFoodmap platform, including but not limited to being provided with buyer information, sending text messages or arranging work appointments in order to go on to provide professional services. Service providers acknowledge and agree that use of the iFoodmap platform does not guarantee that any iFoodmap platform user will use their service items. The iFoodmap platform likewise does not warrant that a service provider or buyer will be successfully matched within any particular period of time, that a service provider will provide a buyer with a fully satisfactory service, or that a buyer will obtain a fully satisfactory service from a service provider.",
              "3. Service providers understand and agree that they are customers of the iFoodmap platform and provide services to buyers solely through the iFoodmap platform, and that service providers are not employees, joint venturers, partners or agents of the iFoodmap platform. Service providers acknowledge that they set or confirm their own prices, use their own equipment and determine their own work schedules, that work-related matters are unrelated to the iFoodmap platform, and that the iFoodmap platform does not warrant or control the quality of the services provided by service providers (including the manner in which service providers provide such services).",
              "4. To the extent permitted by applicable law, if a service provider's records, obtained from publicly available and valid reports, include a record of criminal conviction, the iFoodmap platform may restrict, block, suspend, disable or cancel the service provider's account based on the results of such checks. The service provider further agrees and authorizes the iFoodmap platform to use the service provider's relevant information in order to obtain such reports from the service provider's suppliers."
            ]
          },
          {
            "type": "h2",
            "text": "Article 5: Licence to Use the Platform"
          },
          {
            "type": "p",
            "text": "Subject to compliance with the terms and rules, the iFoodmap platform grants users a limited, non-exclusive, revocable, non-transferable and non-exclusive licence to reproduce or display Platform Content (excluding all software source code), solely for the user's personal and non-commercial use and in connection with the intended use of the iFoodmap platform. Users may not use, copy, adapt, modify, distribute, license, sell, transfer, publicly display, publicly perform, transmit, broadcast or otherwise create derivative works from the platform or Platform Content, except as expressly permitted elsewhere in the rules and terms. If a user downloads or prints a copy of Platform Content for personal use, the user must retain the copyright and other proprietary notices contained in that printed content."
          },
          {
            "type": "h2",
            "text": "Article 6: User Content"
          },
          {
            "type": "ol",
            "items": [
              "1. The iFoodmap platform may, at its sole discretion, permit users to post, upload, publish, submit or transmit User Content. Where a user provides User Content through the iFoodmap platform, the user thereby grants the iFoodmap platform a worldwide, irrevocable, perpetual, non-exclusive, transferable, royalty-free licence, with the right to sublicense, use, reproduce, adapt, modify, distribute, license, sell, assign, publicly display, publicly perform, transmit, broadcast, access, view and otherwise exploit and market the User Content; provided that the user's private information and message content will not be used by the iFoodmap platform in public advertising.",
              "2. For the avoidance of doubt, the licence granted to the iFoodmap platform in User Content is perpetual and is not affected by termination of the user's registered account. However, nothing in these terms shall be deemed to limit the user's own use and exploitation of the User Content they own, including the right to post, upload, publish, transmit or reduce the User Content they originally owned.",
              "3. The iFoodmap platform reserves the right, at any time and without prior notice, for any reason or cause, where there is any possible breach of the terms or other circumstance harmful to the iFoodmap platform or its use, in its sole discretion, to delete User Content or disable access to it."
            ]
          },
          {
            "type": "h2",
            "text": "Article 7: Fees Charged"
          },
          {
            "type": "p",
            "text": "The fees charged by the iFoodmap platform to users, buyers and service providers are as follows:"
          },
          {
            "type": "ol",
            "items": [
              "1. Buyers: the iFoodmap platform does not charge buyers any fee when they submit service requirements through the iFoodmap platform.",
              "2. Service providers: when using the iFoodmap platform to submit quotations, service providers agree first to purchase credits from iFoodmap, and the iFoodmap platform collects its fees by deducting a specified number of credits from the service provider's account. Credits do not expire and may be used indefinitely; unused credits may not be resold, but may be transferred, refunded, or refunded in cash on a pro rata basis after deduction of handling fees."
            ]
          },
          {
            "type": "h2",
            "text": "Article 8: Purchase of Credits by Service Providers and Electronic Invoicing"
          },
          {
            "type": "p",
            "text": "Credits purchased or obtained by a service provider may be used for specified services on the iFoodmap platform, including submitting quotations for service items to buyers (in accordance with the method of using quotation credits set out below). Before credits are deducted, we will transparently inform the service provider of the range of credits required, or the corresponding cash range, for the specific platform feature. Service providers understand that, once iFoodmap platform credits have been purchased, the credits have no cash value and the purchase amount cannot be resold. iFoodmap credits do not expire, but the iFoodmap platform does not guarantee that a service provider will be able to use up its credits within any particular period or that the credits will have any other utility. For enquiries regarding service items and quotation-related fees, please contact customer service."
          },
          {
            "type": "ol",
            "items": [
              "1. Method of using quotation credits: after a buyer submits a service requirement and database matching has been performed, the iFoodmap platform proactively sends the buyer's requirement to service providers matching that requirement. At this stage the iFoodmap platform has not yet provided the buyer's telephone number, email address or other contact details to the provider, and accordingly the iFoodmap platform has not yet deducted the credits required for that service requirement from the service provider's account. Once the service provider has evaluated the requirement and is willing to submit a quotation to that buyer, and has notified the iFoodmap platform accordingly, the iFoodmap platform will send the service provider's quotation notice to the buyer and at the same time provide the buyer's contact details (at minimum an email address; a telephone number is not required) to the provider. At the time the iFoodmap platform sends the quotation, it will deduct the credits required for that service requirement directly from the service provider's account. Subsequently, once the buyer has opened and read the quotation message sent by the iFoodmap platform, the iFoodmap platform will send a read confirmation to the service provider. However, if the buyer does not open and read the quotation message within 48 hours of receiving it from the iFoodmap platform, the iFoodmap platform will proactively return the deducted credits to the service provider's account within fourteen (14) working days.",
              "2. Payment methods for purchasing credits: for market payment processing services for service providers, the iFoodmap platform currently uses the following payment methods: DBS Bank (providing domestic credit card payment and virtual bank account functionality for payment by physical or online ATM transfer), among others. Service providers agree that, when using any of the above payment methods, they are bound by the terms agreed for that payment method. Service providers further agree to provide the iFoodmap platform with accurate and complete information regarding the service provider's business, and authorize the iFoodmap platform to use this information and payment-related information such as transaction records. The iFoodmap platform reserves the right to change payment methods; where a payment method is to be changed, the iFoodmap platform will implement the change three days after publishing notice on the website.",
              "3. Electronic invoices: regardless of the tool or method used to pay for or deduct the purchase of iFoodmap credits, the iFoodmap platform will issue an electronic invoice to the payer in compliance with applicable local law. The iFoodmap platform issues electronic invoices through the Ministry of Finance E-Invoice Platform, and after purchase the user will receive an electronic invoice notification; iFoodmap will no longer send paper invoices. The user agrees that the iFoodmap platform may provide the relevant payment information to the Ministry of Finance E-Invoice Platform in order to facilitate issuance of the electronic invoice, and likewise agrees to comply with the relevant terms of the Ministry of Finance E-Invoice Platform."
            ]
          },
          {
            "type": "h2",
            "text": "Article 9: Credit Card and Overseas Transaction Fees"
          },
          {
            "type": "p",
            "text": "Although credits purchased by service providers from the iFoodmap platform are priced in New Taiwan dollars, because the iFoodmap platform is a company registered in the Republic of China, where a service provider purchases credits using a credit card or from overseas, in addition to paying the iFoodmap platform's fees, if the service provider elects to pay by international credit card or to purchase credits by cross-border remittance, the credit card company or bank will treat the transaction as an overseas transaction and will charge the corresponding overseas transaction or cross-border transfer fee. The fees charged differ between credit card companies and banks; please contact the credit card company or bank making the payment directly to confirm."
          },
          {
            "type": "h2",
            "text": "Article 10: Warranties and Representations"
          },
          {
            "type": "ol",
            "items": [
              "1. Users undertake that the information they provide to the iFoodmap platform is accurate and correct, including but not limited to their name, telephone number, address and email address. If a user provides incorrect information and thereby causes direct or indirect loss to the iFoodmap platform, the user agrees to bear that loss and the related costs arising from it.",
              "2. All users of the iFoodmap platform agree to bear their own risk. The iFoodmap platform does not warrant or guarantee the accuracy of information provided by users, service providers or buyers, and where any inaccuracy of information occurs, the iFoodmap platform bears no liability for damages.",
              "3. Every user warrants that all information they provide to the iFoodmap platform is true and free from fraud, falsity, misleading statements, exaggeration or any breach of law or public order and good morals. If a misrepresentation causes loss to either the user or the iFoodmap platform, the party making the misrepresentation agrees to bear the related liability for damages, and the iFoodmap platform is released from any liability for damages.",
              "4. Users warrant that they are responsible for the User Content provided on or through the iFoodmap platform. Users represent and warrant that: (1) the user is the sole and exclusive owner of all User Content and has the right to provide it for use by the iFoodmap platform, or the user holds all the rights, licences, consents and releases required to make the grant to iFoodmap; (2) neither the User Content, nor the user's use, uploading, publication, submission or transmission of the User Content (or any part of it) through the iFoodmap platform, infringes, misappropriates or violates any third party's patent, copyright, trademark, trade secret, moral rights or other proprietary or intellectual property rights, or rights of publicity or privacy, or results in a breach of any applicable law or regulation; and (3) the iFoodmap platform may proofread, compile or otherwise edit or withdraw User Content, and the user shall ensure that such edited content is accurate and that the user complies with the representations and warranties agreed in the terms and rules.",
              "5. If there is any concern that advertisements, service information, quotations or other content provided by a service provider on the iFoodmap platform breaches the laws of the Republic of China, the iFoodmap platform may remove that content directly without the service provider's consent, and the service provider may raise no objection.",
              "6. Users agree that, if the iFoodmap platform finds that content posted by any user on the iFoodmap platform is abusive, harmful, unlawful, racially discriminatory, obscene, sexually harassing, disparaging of the iFoodmap platform or manifestly fabricated, the iFoodmap platform may edit, adjust or delete it at its discretion without obtaining the user's consent.",
              "7. The user agrees to indemnify and defend the iFoodmap platform and its shareholders, subsidiaries, affiliates, directors, managers, agents, co-branding partners or other business partners and employees, and to hold them harmless from any claims, actions, proceedings and litigation, and all related liabilities, damages, liquidated damages, fines, costs and expenses (including but not limited to other dispute resolution costs) caused by or related to the following matters attributable to the user: (1) the user's breach or violation of any provision of these terms of service, or of any policy or guideline referred to in these terms of service; (2) the user's use or misuse of the services; and (3) the user's breach of law or infringement of any third party's rights. The user further agrees to use the services for lawful purposes and to comply with these terms of service and all applicable laws, regulations, codes, directives, guidelines, policies and standards.",
              "8. Service providers shall warrant that the services they provide and the qualifications of the personnel providing those services comply in all respects with the laws and regulations of the Government of the Republic of China, and service providers shall hold any government approvals or other relevant documentation required by law. Where any breach of the laws and regulations of the Republic of China causes the iFoodmap platform to be subject to an administrative fine or other legal sanction, the service provider agrees to be unconditionally responsible for all resulting legal liability and to bear the related liability for damages.",
              "9. Disclaimer regarding professionals: the iFoodmap platform has taken corresponding measures to verify the licences of persons providing professional services as far as possible; however, where such a person provides false information and the iFoodmap platform consequently passes that information to buyers, the iFoodmap platform cannot undertake or confirm the accuracy of that information or bear the related liability. Accordingly, when a buyer submits a requirement for a professional service, the buyer agrees that, upon accepting a service provider's quotation and before confirming acceptance of the service, the buyer will itself request the relevant licences from the service provider. If a buyer fails to confirm the relevant licences with the service provider and thereby suffers loss, the buyer agrees that the iFoodmap platform bears no liability."
            ]
          },
          {
            "type": "h2",
            "text": "Article 11: Personal Data Protection"
          },
          {
            "type": "ol",
            "items": [
              "1. Users acknowledge and agree that any personal data entered when using the iFoodmap platform may be freely used by iFoodmap after collection and provided to relevant service providers, without further consent from the user.",
              "2. Service providers acknowledge and understand that the users' personal data provided by the iFoodmap platform is collected, processed and used in the name of the iFoodmap platform, and that service providers may use the personal data provided by the iFoodmap platform only within the scope necessary to provide their services, and may not use it for any marketing or other use of personal data directed at users.",
              "3. Service providers must comply with the Personal Data Protection Act and related laws and regulations, and shall adopt appropriate security measures in respect of users' personal data provided by the iFoodmap platform so as to avoid causing any loss to buyers.",
              "4. If a service provider breaches the Personal Data Protection Act or related laws and regulations, or breaches any provision of this agreement, and a personal data dispute thereby arises, the service provider shall immediately notify the iFoodmap platform and handle the matter in accordance with the iFoodmap platform's instructions. The service provider agrees to bear the related legal liability itself and, where the iFoodmap platform suffers loss as a result, shall compensate the iFoodmap platform for that loss."
            ]
          },
          {
            "type": "h2",
            "text": "Article 12: Confidentiality Obligations"
          },
          {
            "type": "ol",
            "items": [
              "1. Information provided by the iFoodmap platform and held by a service provider in the course of performing this agreement, including but not limited to the contents of this agreement, users' personal data or other information not publicly disclosed, shall be kept confidential with the care of a good administrator. Except as used in accordance with this agreement, the service provider may not use such undisclosed information itself or disclose it to any third party without the prior written consent of the iFoodmap platform. Where a service provider discloses such information to employees, consultants or third parties it considers necessary, it shall ensure that those recipients are subject to confidentiality obligations equivalent to those in this agreement.",
              "2. The confidentiality provisions remain in effect notwithstanding the rescission, termination or expiry of this agreement, until the confidential information loses its confidential nature for reasons not attributable to the service provider. The iFoodmap platform may at any time, by written notice, require the service provider to delete or return that confidential information."
            ]
          },
          {
            "type": "h2",
            "text": "Article 13: Prohibited Conduct"
          },
          {
            "type": "p",
            "text": "As a user of iFoodmap, the user agrees not to engage in any of the following:"
          },
          {
            "type": "ol",
            "items": [
              "1. Using another person's account, misrepresenting oneself or the service items offered through the iFoodmap platform, falsely representing identity or qualifications, misrepresenting the project or other information in the course of submitting a requirement or quotation, or posting service items in an inappropriate category on the iFoodmap platform.",
              "2. Using any automated system, including but not limited to robots, offline readers and similar tools, to access the iFoodmap platform without the prior written approval of the iFoodmap platform; provided that, where the operator of a public search engine is building a publicly searchable index of material, the iFoodmap platform agrees that robots may be used to copy information on the iFoodmap platform, but such material may not be archived, and the iFoodmap platform reserves the right to revoke these exceptions generally or in particular cases.",
              "3. Copying copyright-protected content by any manual or automated means, or otherwise misusing or misappropriating the iFoodmap platform's information or content, including but not limited to use on similar, competing or third-party websites.",
              "4. Submitting, within a given period of time, an excessive number of unreasonable requests on the iFoodmap platform, or requests that are manifestly not made by an ordinary browser or by a human.",
              "5. Taking any action that may unreasonably damage the iFoodmap platform's infrastructure, for example: (1) interfering or attempting to interfere with the normal operation of the iFoodmap platform or of third parties; (2) attempting to avoid or circumvent measures used to prevent or limit access to the iFoodmap platform; (3) circumventing, disabling or otherwise interfering with the security features of the iFoodmap platform; (4) distributing viruses or any other technology that may damage the iFoodmap platform; or (5) using the iFoodmap platform in a way that infringes any copyright, trade secret or other right of any party or third party, including rights of privacy or publicity.",
              "6. In the case of a service provider, circumventing in any way the obligation to pay the iFoodmap platform for the purchase of credits.",
              "7. Collecting personally identifiable information from the iFoodmap platform, including but not limited to names or other account information, or using the communication systems provided by the iFoodmap platform for purposes other than those agreed in the terms, including for commercial solicitation, recruitment or advertising purposes.",
              "8. Engaging in solicitation or recruitment of service providers or buyers for employment or hiring purposes, or for any use inconsistent with the purpose of the iFoodmap platform.",
              "9. Taking any inappropriate or unlawful action, including submitting inappropriate or unlawful content through the iFoodmap platform, including content that is harassing, hateful, unlawful, profane, obscene, defamatory, threatening or discriminatory, or that advocates, promotes or encourages inappropriate activity, where such conduct may be regarded as a criminal offence, give rise to civil liability, or breach any law.",
              "10. Breaching any of the iFoodmap platform's rules concerning use of the iFoodmap platform or governing the relationship between the iFoodmap platform and users.",
              "11. Advertising or soliciting service items that the iFoodmap platform does not offer or that are inconsistent with its purpose, including but not limited to: (1) any service item that does not fall within a supported service category or that offers only the sale of products; (2) offering directories or referrals; (3) offering loans; (4) offering space for rent; (5) engaging in competition with the iFoodmap platform's business; (6) promoting or offering pyramid schemes, spam or unsolicited commercial content; or (7) offering unlawful service items.",
              "12. Engaging in any conduct that may impair the validity or accuracy of reviews, ratings, evaluations or systems.",
              "13. A service provider failing to perform a service item as promised, unless the buyer has failed materially to perform the service agreement and terms agreed between the parties, has refused payment, an obvious error has occurred, or the service provider is unable to verify the customer's identity.",
              "14. Engaging in fraudulent conduct.",
              "15. Purchasing a service item without meeting the buyer eligibility requirements.",
              "16. Carrying out any activity or engaging in any conduct inconsistent with the business or purpose of the iFoodmap platform.",
              "17. Submitting a pre-order, request, negotiation or service item requirement without a genuine requirement or without the intention to pay."
            ]
          },
          {
            "type": "h2",
            "text": "Article 14: Special Provisions"
          },
          {
            "type": "p",
            "text": "If the iFoodmap platform discovers that an account registered by a service provider or buyer may have been registered by a competitor and that, in using the intermediary services provided by the iFoodmap platform, that account engages in any conduct that may affect the iFoodmap platform's business operations, the iFoodmap platform may, without the consent of the account holder, suspend the account and terminate the legal contract established between the service provider or buyer and the iFoodmap platform. If unused credits remain in that registered account, the iFoodmap platform agrees to refund the corresponding amount in proportion to the remaining credits, based on the fees the account holder paid to purchase the credits."
          },
          {
            "type": "h2",
            "text": "Article 15: Intellectual Property Rights"
          },
          {
            "type": "p",
            "text": "All text, graphics, editorial content, charts, designs, photographs, images, typefaces and other content on the iFoodmap platform website that buyers or service providers may view and use belongs to the iFoodmap platform and is protected by the relevant laws and regulations of the Republic of China. Buyers and service providers may not reproduce it or engage in any conduct in breach of the Copyright Act or the Trademark Act without the prior written consent of the iFoodmap platform."
          },
          {
            "type": "h2",
            "text": "Article 16: Disclaimers"
          },
          {
            "type": "ol",
            "items": [
              "1. Users, buyers and service providers agree to bear the risks associated with using the professional services of the iFoodmap platform themselves, to the maximum extent permitted by law. The iFoodmap platform provides its services based on the information supplied by users, and makes no express, implied or statutory warranty, claim or representation in respect of the services, including but not limited to warranties of quality, performance, truthfulness, accuracy, completeness, non-infringement or fitness for a particular purpose, or warranties arising from trade usage in the course of dealing. Without limiting the foregoing, and to the maximum extent permitted by law, the iFoodmap platform does not warrant that the services, the website or the features contained in them will be provided, or that such services, website or features will at all times be verifiable, uninterrupted, timely, secure, reliable, correct, complete or error-free. The iFoodmap platform is likewise not responsible for any defamation or unlawful conduct by any third party, or for any loss suffered as a result of any data, information or material used through the iFoodmap platform. In addition, the iFoodmap platform does not warrant the accuracy of any advice or information on the website platform, whether oral or in writing.",
              "2. Users, buyers and service providers acknowledge and agree that the iFoodmap platform has no obligation to, and reserves the right without any reason to: (1) monitor or review User Content; and (2) for purposes permitted by law, carry out identity verification, licence checks, criminal background checks and sex offender registry checks on users, including but not limited to service providers and buyers.",
              "3. Users bear sole responsibility for all communications and interactions with other users of the iFoodmap platform, including but not limited to any service provider, buyer or member associated with a service provider. Users understand that the iFoodmap platform does not guarantee that it will verify, review or check any statement or content of iFoodmap platform users. The iFoodmap platform makes no representation or warranty as to the conduct of users or their compatibility with any current or future users of the iFoodmap platform. Users agree to take reasonable precautions in all communications and interactions with other users of the iFoodmap platform, particularly where the user decides to go offline or to meet in person in order to provide or receive professional services. The iFoodmap platform is not responsible for any liability arising from the acts or omissions of any user or third party.",
              "4. The iFoodmap platform bears no liability for damages (whether based on contractual liability, tort liability, product liability or any other legal basis) for any risk arising from, or any indirect, incidental, special or consequential loss caused by, the use of or inability to use this website or the services, regardless of whether the iFoodmap platform has been advised of the possibility of such loss. Even where the limited remedies described in the terms fail of their essential purpose, the iFoodmap platform shall also be released from liability for: (1) any incidental, special or consequential damages, including loss of profits, loss of data or loss of goodwill; (2) service interruption, computer damage or system failure; (3) the cost of substitute goods or services; (4) any damages arising from personal or bodily injury or emotional distress related to or connected with these terms; (5) the use of or inability to use the platform, the professional services or the Platform Content; or (6) contact with, or access to, any other user of the iFoodmap platform or any other person communicated or interacted with as a result of using the iFoodmap platform."
            ]
          },
          {
            "type": "h2",
            "text": "Article 17: Matters Not Undertaken by the iFoodmap Platform"
          },
          {
            "type": "p",
            "text": "The iFoodmap platform is not a party to any agreement formed between service providers, users or third parties. Neither the terms and rules established by the iFoodmap platform nor any part of the iFoodmap Platform Content, including but not limited to any programme or other service, creates any agency, partnership, joint venture or employment relationship between the iFoodmap platform and users, buyers or service providers. No member or user of the iFoodmap platform may direct or control the day-to-day activities of another party, or assume any obligation on behalf of another party. Although the terms and rules require users to provide accurate information, and although the iFoodmap platform may carry out additional checks and tests to verify or examine a user's identity or background, the iFoodmap platform does not confirm or endorse any user or their claimed identity or background, regardless of the service items they use."
          },
          {
            "type": "p",
            "text": "Any reference on the iFoodmap platform to a user being licensed or trusted in some manner indicates only that the user has completed the relevant account process or met the user review criteria, and does not represent the correctness or truthfulness of any other content, nor does it impose any additional obligation of performance on the iFoodmap platform. No such description constitutes certification or a warranty by the iFoodmap platform, nor does it mean that the iFoodmap platform has verified the user's identity or formed any belief as to whether a service provider's service items are licensed, insured, trustworthy, safe or suitable. Any such information is provided solely to assist users in evaluating a service provider's identity and suitability when seeking professional services through the iFoodmap platform."
          },
          {
            "type": "h2",
            "text": "Article 18: User Feedback and Responses"
          },
          {
            "type": "p",
            "text": "In respect of any feedback, comments, questions or suggestions regarding the iFoodmap platform's services (collectively, \"Feedback Content\"), the user warrants that: (1) the user has the right to disclose the relevant Feedback Content; (2) the Feedback Content does not infringe the rights of any other person or entity; and (3) the Feedback Content does not contain any confidential or proprietary information of any third party or any party."
          },
          {
            "type": "p",
            "text": "By submitting any Feedback Content, the user further: (1) agrees that the iFoodmap platform has no express or implied obligation of confidentiality in respect of the Feedback Content; (2) grants the iFoodmap platform an irrevocable, non-exclusive, royalty-free, perpetual, worldwide licence to use, modify, prepare derivative works of, publish, distribute and sublicense the Feedback Content; and (3) agrees to waive any claim of moral rights against the iFoodmap platform and other users in respect of the Feedback Content."
          },
          {
            "type": "h2",
            "text": "Article 19: Handling of Breaches of the Terms"
          },
          {
            "type": "p",
            "text": "Without limiting any other rights reserved herein, if a user breaches the policies or the terms and rules established by the iFoodmap platform, the iFoodmap platform may at its sole discretion take any action permitted by law, including but not limited to deleting posted User Content, restricting the user's access to their registered account on the iFoodmap platform, terminating the user's account, restricting the user's permissions, and cooperating with judicial authorities in investigations or prosecutions."
          },
          {
            "type": "h2",
            "text": "Article 20: Suspension or Termination of Accounts"
          },
          {
            "type": "p",
            "text": "The user agrees that the iFoodmap platform may, at its sole discretion, with or without cause and with or without prior notice, at any time decide to restrict, block, suspend, disable or cancel all or part of the user's registered account. Further, if a user breaches the iFoodmap platform's terms and rules, the iFoodmap platform may take any or all of the following actions without prior notice or explanation: (1) the user's registered account will be disabled or suspended and the account password will be deactivated, the user will be unable to log in to the iFoodmap platform, and User Content may also be removed; (2) in certain circumstances, the iFoodmap platform may notify other users that the account has been terminated, blocked, suspended, disabled or cancelled, and the reasons for taking that action; (3) buyers agree that they have no right to cancel or delay payment of service fees to a service provider by reason of account termination; and (4) the iFoodmap platform will not compensate a service provider for any loss caused by account termination, including loss from cancelled or delayed service items. Users may cease using the iFoodmap platform or terminate their registered account at any time. To terminate an account, please contact customer service."
          },
          {
            "type": "p",
            "text": "Please note, however, that after an account is cancelled or terminated we have no obligation to delete any content posted by the user to the iFoodmap platform, including but not limited to any reviews. The iFoodmap platform also expects users to respect the intellectual property laws and regulations of the Republic of China, and where appropriate, once a user's account infringes or is considered to infringe another person's intellectual property rights, the iFoodmap platform will terminate that user's account."
          },
          {
            "type": "h2",
            "text": "Article 21: Disputes Between Users"
          },
          {
            "type": "p",
            "text": "The iFoodmap platform values all of its users; however, disputes between users are inevitable. Because the iFoodmap platform does not itself provide any service items, users agree that, where any dispute arises in respect of service items provided by a service provider, the users may seek resolution directly between themselves by bringing mediation or litigation before the court with jurisdiction over the dispute in accordance with the laws of the Republic of China. All users acknowledge and agree that the iFoodmap platform acts solely as a provider of information in dispute resolution cases and is not a party to such cases, and accordingly the iFoodmap platform has no obligation to participate in such dispute resolution cases or to assist in resolving the dispute."
          },
          {
            "type": "h2",
            "text": "Article 22: Governing Law and Jurisdiction"
          },
          {
            "type": "p",
            "text": "In respect of the interpretation and application of the terms of service of this agreement, if either party becomes involved in a legal issue giving rise to a dispute or controversy with iFoodmap, the user agrees that the Taiwan Taoyuan District Court shall be the court of first instance having jurisdiction, and that the matter shall be interpreted and handled in accordance with the laws of the Republic of China."
          },
          {
            "type": "h2",
            "text": "Article 23: Other Agreed Provisions"
          },
          {
            "type": "ol",
            "items": [
              "1. Force majeure: except for payment obligations, neither the iFoodmap platform nor the user shall be liable to the other for any delay or failure arising from causes beyond its control. Such causes include but are not limited to fire, flood, earthquake, strike, declared or undeclared war, or national disaster.",
              "2. Entire agreement: any other legal notice or additional terms or policies published by the iFoodmap platform shall form the entire agreement between the user and the iFoodmap platform concerning use of the iFoodmap platform. Except as expressly stated in this article, if a court of competent jurisdiction holds any provision of these terms to be invalid, that invalidity shall not affect the validity of the remaining provisions.",
              "3. Waiver: any waiver of a right shall not be deemed a further or continuing waiver of any other right. Further, where the iFoodmap platform does not assert a right under any provision, that right shall not be deemed waived.",
              "4. Contact information: if a user has any questions about the above terms or the services provided by the iFoodmap platform, please contact customer service."
            ]
          }
        ]
      }
    },
    {
      "slug": "privacy",
      "updated": null,
      "zh": {
        "title": "隱私權政策",
        "summary": "食材地圖如何蒐集、處理、利用與保護使用本網站者的個人資料。",
        "blocks": [
          {
            "type": "h2",
            "text": "會員隱私權保護"
          },
          {
            "type": "p",
            "text": "非常歡迎您光臨「食材地圖媒合網」（以下簡稱本網站），為了讓您能夠安心使用本網站的各項服務與資訊，特此向您說明本網站的隱私權保護政策，以保障您的權益，請您詳閱下列內容："
          },
          {
            "type": "h2",
            "text": "一、隱私權保護政策的適用範圍"
          },
          {
            "type": "p",
            "text": "隱私權保護政策內容，包括本網站如何處理在您使用網站服務時收集到的個人識別資料。隱私權保護政策不適用於本網站以外的相關連結網站，也不適用於非本網站所委託或參與管理的人員。"
          },
          {
            "type": "h2",
            "text": "二、個人資料的蒐集、處理及利用方式"
          },
          {
            "type": "p",
            "text": "當您造訪本網站或使用本網站所提供之功能服務時，我們將視該服務功能性質，請您提供必要的個人資料，並在該特定目的範圍內處理及利用您的個人資料；非經您書面同意，本網站不會將個人資料用於其他用途。 本網站在您使用服務信箱、問卷調查等互動性功能時，會保留您所提供的姓名、電子郵件地址、聯絡方式及使用時間等。 於一般瀏覽時，伺服器會自行記錄相關行徑，包括您使用連線設備的IP位址、使用時間、使用的瀏覽器、瀏覽及點選資料記錄等，做為我們增進網站服務的參考依據，此記錄為內部應用，決不對外公佈。 為提供精確的服務，我們會將收集的問卷調查內容進行統計與分析，分析結果之統計數據或說明文字呈現，除供內部研究外，我們會視需要公佈統計數據及說明文字，但不涉及特定個人之資料。"
          },
          {
            "type": "h2",
            "text": "三、資料之保護"
          },
          {
            "type": "p",
            "text": "本網站主機均設有防火牆、防毒系統等相關的各項資訊安全設備及必要的安全防護措施，加以保護網站及您的個人資料採用嚴格的保護措施，只由經過授權的人員才能接觸您的個人資料，相關處理人員皆簽有保密合約，如有違反保密義務者，將會受到相關的法律處分。 如因業務需要有必要委託其他單位提供服務時，本網站亦會嚴格要求其遵守保密義務，並且採取必要檢查程序以確定其將確實遵守。"
          },
          {
            "type": "h2",
            "text": "四、網站對外的相關連結"
          },
          {
            "type": "p",
            "text": "本網站的網頁提供其他網站的網路連結，您也可經由本網站所提供的連結，點選進入其他網站。但該連結網站不適用本網站的隱私權保護政策，您必須參考該連結網站中的隱私權保護政策。"
          },
          {
            "type": "h2",
            "text": "五、與第三人共用個人資料之政策"
          },
          {
            "type": "p",
            "text": "本網站絕不會提供、交換、出租或出售任何您的個人資料給其他個人、團體、私人企業或公務機關，但有法律依據或合約義務者，不在此限。"
          },
          {
            "type": "p",
            "text": "前項但書之情形包括不限於： 經由您書面同意。 法律明文規定。 為免除您生命、身體、自由或財產上之危險。 與公務機關或學術研究機構合作，基於公共利益為統計或學術研究而有必要，且資料經過提供者處理或蒐集著依其揭露方式無從識別特定之當事人。 當您在網站的行為，違反服務條款或可能損害或妨礙網站與其他使用者權益或導致任何人遭受損害時，經網站管理單位研析揭露您的個人資料是為了辨識、聯絡或採取法律行動所必要者。 有利於您的權益。 本網站委託廠商協助蒐集、處理或利用您的個人資料時，將對委外廠商或個人善盡監督管理之責。"
          },
          {
            "type": "h2",
            "text": "六、Cookie之使用"
          },
          {
            "type": "p",
            "text": "為了提供您最佳的服務，本網站會在您的電腦中放置並取用我們的Cookie，若您不願接受Cookie的寫入，您可在您使用的瀏覽器功能項中設定隱私權等級為高，即可拒絕Cookie的寫入，但可能會導至網站某些功能無法正常執行 。"
          },
          {
            "type": "h2",
            "text": "七、隱私權保護政策之修正"
          },
          {
            "type": "p",
            "text": "本網站隱私權保護政策將因應需求隨時進行修正，修正後的條款將刊登於網站上。"
          }
        ]
      },
      "en": {
        "title": "Privacy Policy",
        "summary": "How iFoodmap collects, processes, uses and protects the personal data of people who use the site.",
        "blocks": [
          {
            "type": "h2",
            "text": "Member Privacy Protection"
          },
          {
            "type": "p",
            "text": "Welcome to the iFoodmap Matching Network (the \"Website\"). So that you can use the Website's services and information with confidence, we set out below the Website's privacy protection policy in order to safeguard your rights. Please read the following carefully:"
          },
          {
            "type": "h2",
            "text": "1. Scope of this Privacy Protection Policy"
          },
          {
            "type": "p",
            "text": "This privacy protection policy covers how the Website handles personally identifiable information collected when you use the Website's services. This privacy protection policy does not apply to linked websites outside the Website, nor does it apply to personnel not engaged or managed by the Website."
          },
          {
            "type": "h2",
            "text": "2. Collection, Processing and Use of Personal Data"
          },
          {
            "type": "p",
            "text": "When you visit the Website or use the features and services it provides, we will, depending on the nature of the service in question, ask you to provide the necessary personal data, and will process and use your personal data within the scope of that specific purpose; without your written consent, the Website will not use your personal data for any other purpose. When you use interactive features such as the service mailbox or questionnaires, the Website retains the name, email address, contact details and time of use that you provide. During ordinary browsing, the server automatically records related activity, including the IP address of the device you connect from, the time of use, the browser used, and browsing and click records, which serve as a reference for improving the Website's services; these records are for internal use only and are never disclosed externally. In order to provide accurate services, we compile statistics and analysis from the questionnaire content we collect; other than for internal research, we may publish the statistical figures or explanatory text resulting from that analysis as needed, but these do not involve the data of any specific individual."
          },
          {
            "type": "h2",
            "text": "3. Data Protection"
          },
          {
            "type": "p",
            "text": "The Website's servers are equipped with firewalls, anti-virus systems and other information security equipment and necessary security measures to protect the Website and your personal data, and strict protective measures are applied so that only authorized personnel may access your personal data. The personnel involved have all signed confidentiality agreements, and any person who breaches their confidentiality obligations will be subject to the applicable legal penalties. Where business needs make it necessary to engage other organizations to provide services, the Website will also strictly require them to comply with confidentiality obligations and will adopt the necessary inspection procedures to confirm that they do so."
          },
          {
            "type": "h2",
            "text": "4. Links to External Websites"
          },
          {
            "type": "p",
            "text": "The Website's pages provide links to other websites, and you may click through to other websites via the links the Website provides. However, this Website's privacy protection policy does not apply to those linked websites, and you must refer to the privacy protection policy of the linked website concerned."
          },
          {
            "type": "h2",
            "text": "5. Policy on Sharing Personal Data with Third Parties"
          },
          {
            "type": "p",
            "text": "The Website will never provide, exchange, rent or sell any of your personal data to other individuals, groups, private enterprises or public agencies, except where there is a legal basis or contractual obligation to do so."
          },
          {
            "type": "p",
            "text": "The exceptions referred to in the preceding paragraph include but are not limited to: with your written consent; where expressly provided by law; to avert danger to your life, body, freedom or property; where it is necessary for statistical or academic research in the public interest in cooperation with a public agency or academic research institution, and the data has been processed by the provider or collected in a manner from which no specific individual can be identified; where your conduct on the Website breaches the terms of service or may harm or obstruct the rights and interests of the Website or other users, or cause loss to any person, and the Website's administrators determine after analysis that disclosure of your personal data is necessary in order to identify, contact or take legal action against you; where it is to your benefit; and where the Website engages contractors to assist in collecting, processing or using your personal data, in which case it will exercise due supervision and management over the outsourced contractor or individual."
          },
          {
            "type": "h2",
            "text": "6. Use of Cookies"
          },
          {
            "type": "p",
            "text": "In order to provide you with the best service, the Website places and accesses our cookies on your computer. If you do not wish to accept cookies, you may set the privacy level in your browser's settings to high in order to refuse cookies, although this may prevent certain functions of the website from operating correctly."
          },
          {
            "type": "h2",
            "text": "7. Amendment of this Privacy Protection Policy"
          },
          {
            "type": "p",
            "text": "The Website's privacy protection policy will be amended from time to time as required, and the amended provisions will be published on the Website."
          }
        ]
      }
    }
  ];

  function pick(doc, lang) {
    var body = doc[lang === 'en' ? 'en' : 'zh'];
    return {
      slug: doc.slug, updated: doc.updated,
      title: body.title, summary: body.summary, blocks: body.blocks,
    };
  }

  return {
    all: function (lang) { return DOCS.map(function (d) { return pick(d, lang); }); },
    bySlug: function (slug, lang) {
      for (var i = 0; i < DOCS.length; i++) if (DOCS[i].slug === slug) return pick(DOCS[i], lang);
      return null;
    },
    count: DOCS.length,
    _raw: DOCS,
  };
});
