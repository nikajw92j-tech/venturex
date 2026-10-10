import type { Locale } from "@/i18n/config";

type QA = { q: string; a: string };

export const FAQ: Record<Locale, QA[]> = {
  en: [
    { q: "How does VENTUREX make money?", a: "Listing is free. When a sale completes we deduct a success commission from the final price: 10% under $500, 8% from $500 to $1,999, 6% from $2,000 to $9,999 and 4% from $10,000. No commission is charged on cancelled or unsuccessful transactions. Optional seller plans and listing promotions are billed separately." },
    { q: "How are my payments protected?", a: "Buyers pay through a licensed payment provider, never directly to the seller. Funds are held until the seller has transferred the business and both parties confirm the handover. High-value sales use a third-party escrow partner. We never store card numbers." },
    { q: "Are the revenue figures verified?", a: "Each listing shows whether figures are seller-reported or independently verified. Verified badges appear only after our team reviews evidence such as payment-processor exports or analytics access. Always perform your own due diligence." },
    { q: "How do live auctions work?", a: "Sellers set a starting bid, minimum increment, duration and optional reserve or Buy Now price. Bids update in real time. You can set a maximum automatic bid and we'll bid for you only as much as needed. A bid placed in the final 2 minutes extends the auction by 2 minutes to prevent sniping." },
    { q: "What happens after I win an auction?", a: "Winning creates a pending purchase. You pay through secure checkout within the payment window, then the seller transfers domains, code and accounts through a tracked checklist. Ownership transfers only after verified payment and a confirmed handover." },
    { q: "Can I sell a project that has no revenue?", a: "Yes. The Starter Market is built for new websites, MVPs, AI tools, templates and source code. Pre-revenue projects are kept separate from established businesses so buyers always know what they are looking at." },
    { q: "What if something goes wrong during the handover?", a: "Either party can open a dispute before funds are released. Funds stay frozen while our team reviews the evidence and the full audit log of the transfer, and decides on a release or a refund." },
    { q: "Which currencies can I use?", a: "Listings can be priced in USD, GEL or EUR. You can display prices in USD, GEL, EUR or RUB — converted prices are for display only and you always pay the exact amount in the listing's currency." },
  ],
  ka: [
    { q: "როგორ გამოიმუშავებს VENTUREX შემოსავალს?", a: "განცხადების განთავსება უფასოა. წარმატებული გაყიდვისას საბოლოო ფასიდან ვაკავებთ საკომისიოს: 10% — $500-მდე, 8% — $500-დან $1,999-მდე, 6% — $2,000-დან $9,999-მდე და 4% — $10,000-დან. გაუქმებულ ან წარუმატებელ გარიგებებზე საკომისიო არ იხდება." },
    { q: "როგორ არის დაცული ჩემი გადახდები?", a: "მყიდველი იხდის ლიცენზირებული გადახდის პროვაიდერის მეშვეობით და არა პირდაპირ გამყიდველთან. თანხა იყინება მანამ, სანამ გამყიდველი ბიზნესს გადასცემს და ორივე მხარე დაადასტურებს გადაცემას. მაღალი ღირებულების გარიგებები ესქროუ-პარტნიორით ხორციელდება." },
    { q: "გადამოწმებულია თუ არა შემოსავლის მონაცემები?", a: "ყველა განცხადებაზე ჩანს, მონაცემები გამყიდველის მიერაა მითითებული თუ დამოუკიდებლად გადამოწმებული. ვერიფიკაციის ნიშანი ჩნდება მხოლოდ მტკიცებულებების შემოწმების შემდეგ. ყოველთვის ჩაატარეთ საკუთარი შემოწმება." },
    { q: "როგორ მუშაობს ლაივ აუქციონები?", a: "გამყიდველი ადგენს საწყის ფსონს, მინიმალურ ბიჯს, ხანგრძლივობას და სურვილისამებრ რეზერვს ან Buy Now ფასს. ფსონები რეალურ დროში ახლდება. ბოლო 2 წუთში დადებული ფსონი აუქციონს 2 წუთით აგრძელებს." },
    { q: "რა ხდება აუქციონის მოგების შემდეგ?", a: "მოგება ქმნის მოლოდინში მყოფ შესყიდვას. იხდით უსაფრთხო გადახდით, შემდეგ გამყიდველი გადმოგცემთ დომენს, კოდს და ანგარიშებს. საკუთრება გადადის მხოლოდ დადასტურებული გადახდისა და გადაცემის შემდეგ." },
    { q: "შემიძლია გავყიდო პროექტი შემოსავლის გარეშე?", a: "დიახ. Starter Market შექმნილია ახალი საიტების, MVP-ების, AI ხელსაწყოების, შაბლონებისა და კოდისთვის. შემოსავლამდელი პროექტები ცალკეა დადგენილი ბიზნესებისგან." },
    { q: "რა მოხდება, თუ გადაცემისას პრობლემა შეიქმნა?", a: "ნებისმიერ მხარეს შეუძლია დავის გახსნა თანხის გათავისუფლებამდე. თანხა გაყინულია, სანამ ჩვენი გუნდი განიხილავს მტკიცებულებებს და გადაწყვეტს." },
    { q: "რომელი ვალუტები შემიძლია გამოვიყენო?", a: "ფასი შეიძლება განისაზღვროს USD, GEL ან EUR-ში. ჩვენება შესაძლებელია USD, GEL, EUR ან RUB-ში — კონვერტირებული ფასი მხოლოდ საინფორმაციოა, გადაიხდით ზუსტად განცხადების ვალუტაში." },
  ],
  ru: [
    { q: "Как зарабатывает VENTUREX?", a: "Размещение бесплатно. При успешной продаже мы удерживаем комиссию с итоговой цены: 10% до $500, 8% от $500 до $1 999, 6% от $2 000 до $9 999 и 4% от $10 000. За отменённые и несостоявшиеся сделки комиссия не взимается." },
    { q: "Как защищены мои платежи?", a: "Покупатель платит через лицензированного платёжного провайдера, а не напрямую продавцу. Средства удерживаются, пока продавец не передаст бизнес и обе стороны не подтвердят передачу. Крупные сделки проходят через эскроу-партнёра. Мы не храним номера карт." },
    { q: "Проверяются ли показатели выручки?", a: "В каждом объявлении указано, предоставлены ли данные продавцом или проверены независимо. Значок проверки появляется только после изучения доказательств нашей командой. Всегда проводите собственную проверку." },
    { q: "Как работают онлайн-аукционы?", a: "Продавец задаёт стартовую ставку, минимальный шаг, длительность и при желании резервную цену или цену Buy Now. Ставки обновляются в реальном времени. Ставка в последние 2 минуты продлевает аукцион на 2 минуты." },
    { q: "Что происходит после победы в аукционе?", a: "Победа создаёт ожидающую покупку. Вы оплачиваете через защищённый checkout, затем продавец передаёт домены, код и аккаунты по чек-листу. Право собственности переходит только после подтверждённой оплаты и передачи." },
    { q: "Можно ли продать проект без выручки?", a: "Да. Starter Market создан для новых сайтов, MVP, AI-инструментов, шаблонов и исходного кода. Проекты без выручки отделены от действующего бизнеса." },
    { q: "Что если при передаче возникнет проблема?", a: "Любая сторона может открыть спор до выплаты средств. Деньги заморожены, пока наша команда изучает доказательства и журнал передачи." },
    { q: "Какие валюты поддерживаются?", a: "Цены можно указывать в USD, GEL или EUR. Отображать — в USD, GEL, EUR или RUB. Конвертированные цены носят справочный характер: вы платите точную сумму в валюте объявления." },
  ],
};
