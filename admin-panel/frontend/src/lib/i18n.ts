import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'en' | 'uk';

export const languages: { code: Language; name: string; flag: string }[] = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'uk', name: 'Українська', flag: '🇺🇦' },
];

const translations: Record<Language, Record<string, string>> = {
    en: {
        'user.name': 'Admin System',
        'user.role': 'Super User',
    },
    uk: {
        'user.name': 'Адміністратор',
        'user.role': 'Суперкористувач',
    },
};

interface I18nStore {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

export const useI18n = create<I18nStore>()(
    persist(
        (set, get) => ({
            language: 'uk', // Default to Ukrainian
            setLanguage: (lang) => set({ language: lang }),
            t: (key: string) => {
                const lang = get().language;
                return translations[lang]?.[key] || translations['en']?.[key] || key;
            },
        }),
        {
            name: 'admin-lemberg-language',
        }
    )
);
