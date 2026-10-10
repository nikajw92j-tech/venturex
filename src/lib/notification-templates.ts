import type { NotificationType } from "@prisma/client";

type Tpl = { title: string; body: string };
type Locale = "en" | "ka" | "ru";

// {placeholders} are replaced with params at send time.
export const NOTIFICATION_TEMPLATES: Record<NotificationType, Record<Locale, Tpl>> = {
  NEW_BID: {
    en: { title: "New bid on {listing}", body: "A bid of {amount} was placed on your auction." },
    ka: { title: "ახალი ფსონი: {listing}", body: "თქვენს აუქციონზე განთავსდა ფსონი {amount}." },
    ru: { title: "Новая ставка: {listing}", body: "На ваш аукцион сделана ставка {amount}." },
  },
  OUTBID: {
    en: { title: "You've been outbid", body: "Someone bid {amount} on {listing}. Place a higher bid to stay in the lead." },
    ka: { title: "თქვენი ფსონი გადაფარეს", body: "{listing}-ზე ვიღაცამ დადო {amount}. დადეთ მეტი, რომ ლიდერობა შეინარჩუნოთ." },
    ru: { title: "Вашу ставку перебили", body: "Кто-то поставил {amount} на {listing}. Сделайте ставку выше, чтобы остаться лидером." },
  },
  AUCTION_WON: {
    en: { title: "You won {listing}!", body: "Your winning bid was {amount}. Complete payment within {hours} hours to secure the business." },
    ka: { title: "თქვენ მოიგეთ {listing}!", body: "თქვენი მომგებიანი ფსონი იყო {amount}. გადაიხადეთ {hours} საათში." },
    ru: { title: "Вы выиграли {listing}!", body: "Ваша выигрышная ставка — {amount}. Оплатите в течение {hours} ч., чтобы закрепить сделку." },
  },
  AUCTION_LOST: {
    en: { title: "Auction ended: {listing}", body: "The auction has ended and you were not the winning bidder." },
    ka: { title: "აუქციონი დასრულდა: {listing}", body: "აუქციონი დასრულდა და თქვენ არ გამხდარხართ გამარჯვებული." },
    ru: { title: "Аукцион завершён: {listing}", body: "Аукцион завершён, вы не стали победителем." },
  },
  AUCTION_ENDED: {
    en: { title: "Your auction ended: {listing}", body: "{outcome}" },
    ka: { title: "თქვენი აუქციონი დასრულდა: {listing}", body: "{outcome}" },
    ru: { title: "Ваш аукцион завершён: {listing}", body: "{outcome}" },
  },
  AUCTION_ENDING_SOON: {
    en: { title: "Ending soon: {listing}", body: "This auction ends in less than an hour. Current bid: {amount}." },
    ka: { title: "მალე სრულდება: {listing}", body: "აუქციონი სრულდება ერთ საათზე ნაკლებ დროში. მიმდინარე ფსონი: {amount}." },
    ru: { title: "Скоро завершится: {listing}", body: "Аукцион завершится менее чем через час. Текущая ставка: {amount}." },
  },
  OFFER_RECEIVED: {
    en: { title: "New offer on {listing}", body: "You received an offer of {amount}." },
    ka: { title: "ახალი შეთავაზება: {listing}", body: "თქვენ მიიღეთ შეთავაზება {amount}." },
    ru: { title: "Новое предложение: {listing}", body: "Вы получили предложение на {amount}." },
  },
  OFFER_ACCEPTED: {
    en: { title: "Offer accepted: {listing}", body: "Your offer of {amount} was accepted. Complete payment to proceed." },
    ka: { title: "შეთავაზება მიღებულია: {listing}", body: "თქვენი შეთავაზება {amount} მიღებულია. გააგრძელეთ გადახდით." },
    ru: { title: "Предложение принято: {listing}", body: "Ваше предложение на {amount} принято. Перейдите к оплате." },
  },
  OFFER_REJECTED: {
    en: { title: "Offer declined: {listing}", body: "Your offer of {amount} was declined." },
    ka: { title: "შეთავაზება უარყოფილია: {listing}", body: "თქვენი შეთავაზება {amount} უარყოფილია." },
    ru: { title: "Предложение отклонено: {listing}", body: "Ваше предложение на {amount} отклонено." },
  },
  OFFER_COUNTERED: {
    en: { title: "Counter-offer on {listing}", body: "The seller countered with {amount}." },
    ka: { title: "საპასუხო შეთავაზება: {listing}", body: "გამყიდველმა შემოგთავაზათ {amount}." },
    ru: { title: "Встречное предложение: {listing}", body: "Продавец предложил {amount}." },
  },
  PAYMENT_SUCCEEDED: {
    en: { title: "Payment verified", body: "Payment of {amount} for {listing} was verified by the payment provider." },
    ka: { title: "გადახდა დადასტურებულია", body: "{listing}-ის გადახდა {amount} დადასტურდა." },
    ru: { title: "Оплата подтверждена", body: "Оплата {amount} за {listing} подтверждена платёжным провайдером." },
  },
  TRANSFER_UPDATE: {
    en: { title: "Handover update: {listing}", body: "{detail}" },
    ka: { title: "გადაცემის განახლება: {listing}", body: "{detail}" },
    ru: { title: "Передача бизнеса: {listing}", body: "{detail}" },
  },
  NEW_MESSAGE: {
    en: { title: "New message from {sender}", body: "{preview}" },
    ka: { title: "ახალი შეტყობინება: {sender}", body: "{preview}" },
    ru: { title: "Новое сообщение от {sender}", body: "{preview}" },
  },
  LISTING_APPROVED: {
    en: { title: "Listing approved", body: "{listing} is now live on VENTUREX." },
    ka: { title: "განცხადება დამტკიცდა", body: "{listing} უკვე გამოქვეყნებულია VENTUREX-ზე." },
    ru: { title: "Объявление одобрено", body: "{listing} опубликовано на VENTUREX." },
  },
  LISTING_REJECTED: {
    en: { title: "Listing needs changes", body: "{listing} was not approved: {reason}" },
    ka: { title: "განცხადებას ცვლილებები სჭირდება", body: "{listing} არ დამტკიცდა: {reason}" },
    ru: { title: "Объявление требует изменений", body: "{listing} не одобрено: {reason}" },
  },
  PRICE_CHANGE: {
    en: { title: "Price change: {listing}", body: "The price changed from {old} to {amount}." },
    ka: { title: "ფასი შეიცვალა: {listing}", body: "ფასი შეიცვალა {old}-დან {amount}-მდე." },
    ru: { title: "Изменение цены: {listing}", body: "Цена изменилась с {old} на {amount}." },
  },
  SIMILAR_LISTING: {
    en: { title: "New listing matches your interests", body: "{listing} was just listed." },
    ka: { title: "ახალი განცხადება თქვენი ინტერესებით", body: "ახლახან დაემატა {listing}." },
    ru: { title: "Новое объявление по вашим интересам", body: "Только что опубликовано: {listing}." },
  },
  DISPUTE_UPDATE: {
    en: { title: "Dispute update", body: "{detail}" },
    ka: { title: "დავის განახლება", body: "{detail}" },
    ru: { title: "Обновление спора", body: "{detail}" },
  },
  VERIFICATION_UPDATE: {
    en: { title: "Verification update", body: "{detail}" },
    ka: { title: "ვერიფიკაციის განახლება", body: "{detail}" },
    ru: { title: "Обновление верификации", body: "{detail}" },
  },
  PROMOTION_UPDATE: {
    en: { title: "Promotion update: {listing}", body: "{detail}" },
    ka: { title: "პრომოუშენის განახლება: {listing}", body: "{detail}" },
    ru: { title: "Продвижение: {listing}", body: "{detail}" },
  },
  SYSTEM: {
    en: { title: "{title}", body: "{detail}" },
    ka: { title: "{title}", body: "{detail}" },
    ru: { title: "{title}", body: "{detail}" },
  },
};

export function renderTemplate(type: NotificationType, locale: string, params: Record<string, string | number>) {
  const loc = (["en", "ka", "ru"].includes(locale) ? locale : "en") as Locale;
  const tpl = NOTIFICATION_TEMPLATES[type][loc];
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
  return { title: fill(tpl.title), body: fill(tpl.body) };
}
