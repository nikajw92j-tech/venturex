import type { BusinessCategory, DevelopmentStatus } from "@prisma/client";

type L = { en: string; ka: string; ru: string };

export const MAIN_CATEGORIES: { key: BusinessCategory; icon: string; label: L }[] = [
  { key: "ECOMMERCE", icon: "ShoppingBag", label: { en: "E-commerce", ka: "ელ-კომერცია", ru: "E-commerce" } },
  { key: "SHOPIFY", icon: "Store", label: { en: "Shopify stores", ka: "Shopify მაღაზიები", ru: "Магазины Shopify" } },
  { key: "SAAS", icon: "Cloud", label: { en: "SaaS", ka: "SaaS", ru: "SaaS" } },
  { key: "AI_STARTUP", icon: "Sparkles", label: { en: "AI startups", ka: "AI სტარტაპები", ru: "AI-стартапы" } },
  { key: "MOBILE_APP", icon: "Smartphone", label: { en: "Mobile apps", ka: "მობილური აპები", ru: "Мобильные приложения" } },
  { key: "BLOG", icon: "PenLine", label: { en: "Blogs", ka: "ბლოგები", ru: "Блоги" } },
  { key: "AFFILIATE", icon: "Link2", label: { en: "Affiliate sites", ka: "აფილიეიტ საიტები", ru: "Партнёрские сайты" } },
  { key: "ONLINE_SERVICE", icon: "Globe", label: { en: "Online services", ka: "ონლაინ სერვისები", ru: "Онлайн-сервисы" } },
  { key: "AGENCY", icon: "Briefcase", label: { en: "Digital agencies", ka: "ციფრული სააგენტოები", ru: "Digital-агентства" } },
  { key: "DOMAIN", icon: "AtSign", label: { en: "Domains", ka: "დომენები", ru: "Домены" } },
  { key: "YOUTUBE", icon: "MonitorPlay", label: { en: "YouTube channels", ka: "YouTube არხები", ru: "YouTube-каналы" } },
  { key: "SUBSCRIPTION", icon: "Repeat", label: { en: "Subscription platforms", ka: "გამოწერის პლატფორმები", ru: "Подписочные платформы" } },
  { key: "SOFTWARE", icon: "Code2", label: { en: "Software projects", ka: "პროგრამული პროექტები", ru: "Программные проекты" } },
  { key: "PRE_REVENUE", icon: "Rocket", label: { en: "Pre-revenue startups", ka: "შემოსავლამდელი სტარტაპები", ru: "Стартапы без выручки" } },
];

export const STARTER_CATEGORIES: { key: BusinessCategory; icon: string; label: L }[] = [
  { key: "NEW_WEBSITE", icon: "Globe", label: { en: "New websites", ka: "ახალი ვებსაიტები", ru: "Новые сайты" } },
  { key: "AI_TOOL", icon: "Sparkles", label: { en: "AI tools", ka: "AI ხელსაწყოები", ru: "AI-инструменты" } },
  { key: "SAAS_MVP", icon: "Cloud", label: { en: "SaaS MVPs", ka: "SaaS MVP", ru: "SaaS MVP" } },
  { key: "MOBILE_APP", icon: "Smartphone", label: { en: "Mobile apps", ka: "მობილური აპები", ru: "Мобильные приложения" } },
  { key: "TEMPLATE", icon: "LayoutTemplate", label: { en: "Website templates", ka: "საიტის შაბლონები", ru: "Шаблоны сайтов" } },
  { key: "ECOMMERCE_PROJECT", icon: "ShoppingCart", label: { en: "E-commerce projects", ka: "ელ-კომერციის პროექტები", ru: "E-commerce проекты" } },
  { key: "STARTUP_MVP", icon: "Rocket", label: { en: "Startup MVPs", ka: "სტარტაპ MVP", ru: "MVP стартапов" } },
  { key: "SOURCE_CODE", icon: "Code2", label: { en: "Source code", ka: "საწყისი კოდი", ru: "Исходный код" } },
  { key: "UNLAUNCHED_PRODUCT", icon: "Package", label: { en: "Unlaunched products", ka: "გაუშვებელი პროდუქტები", ru: "Незапущенные продукты" } },
  { key: "AUTOMATION_TOOL", icon: "Workflow", label: { en: "Automation tools", ka: "ავტომატიზაციის ხელსაწყოები", ru: "Инструменты автоматизации" } },
];

export const ALL_CATEGORIES = [...MAIN_CATEGORIES, ...STARTER_CATEGORIES.filter((s) => !MAIN_CATEGORIES.some((m) => m.key === s.key))];

export function categoryLabel(key: BusinessCategory | string, locale = "en") {
  const c = ALL_CATEGORIES.find((x) => x.key === key);
  if (!c) return String(key);
  return c.label[(locale as keyof L) in c.label ? (locale as keyof L) : "en"];
}

export const DEV_STATUSES: { key: DevelopmentStatus; label: L }[] = [
  { key: "CONCEPT_WITH_ASSETS", label: { en: "Concept with documented assets", ka: "კონცეფცია დოკუმენტირებული აქტივებით", ru: "Концепция с активами" } },
  { key: "PROTOTYPE", label: { en: "Prototype", ka: "პროტოტიპი", ru: "Прототип" } },
  { key: "MVP", label: { en: "MVP", ka: "MVP", ru: "MVP" } },
  { key: "BETA", label: { en: "Beta", ka: "ბეტა", ru: "Бета" } },
  { key: "LAUNCHED", label: { en: "Launched", ka: "გაშვებული", ru: "Запущен" } },
  { key: "ABANDONED_FUNCTIONAL", label: { en: "Abandoned but functional", ka: "მიტოვებული, მაგრამ მუშა", ru: "Заброшен, но работает" } },
];

export function devStatusLabel(key: DevelopmentStatus | null | undefined, locale = "en") {
  const s = DEV_STATUSES.find((x) => x.key === key);
  return s ? s.label[(locale as keyof L) in s.label ? (locale as keyof L) : "en"] : "—";
}

/** Starter Market price brackets, defined in GEL (minor units). */
export const STARTER_BRACKETS = [
  { key: "under50", minGel: 0, maxGel: 5000, labelKey: "starter.bracket.under50" },
  { key: "50_200", minGel: 5000, maxGel: 20000, labelKey: "starter.bracket.50_200" },
  { key: "200_500", minGel: 20000, maxGel: 50000, labelKey: "starter.bracket.200_500" },
  { key: "500_1000", minGel: 50000, maxGel: 100000, labelKey: "starter.bracket.500_1000" },
  { key: "premium", minGel: 100000, maxGel: null, labelKey: "starter.bracket.premium" },
] as const;

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "GE", name: "Georgia" }, { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" }, { code: "NL", name: "Netherlands" },
  { code: "ES", name: "Spain" }, { code: "IT", name: "Italy" }, { code: "PL", name: "Poland" },
  { code: "UA", name: "Ukraine" }, { code: "AM", name: "Armenia" }, { code: "AZ", name: "Azerbaijan" },
  { code: "TR", name: "Türkiye" }, { code: "KZ", name: "Kazakhstan" }, { code: "RU", name: "Russia" },
  { code: "EE", name: "Estonia" }, { code: "LT", name: "Lithuania" }, { code: "LV", name: "Latvia" },
  { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" }, { code: "IN", name: "India" },
  { code: "AE", name: "United Arab Emirates" }, { code: "IL", name: "Israel" }, { code: "SG", name: "Singapore" },
  { code: "BR", name: "Brazil" }, { code: "MX", name: "Mexico" }, { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" }, { code: "AT", name: "Austria" }, { code: "PT", name: "Portugal" },
];

export function countryName(code: string | null | undefined) {
  if (!code) return "—";
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}
