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
        'nav.documents': 'Documents',
        'nav.dashboard': 'Dashboard',
        'nav.workspace': 'Workspace',
        'upload.title': 'Upload Documents',
        'upload.dropzone': 'Drop PDF, JPG, PNG, or WEBP files here',
        'upload.subtitle': 'or click to browse (max 50MB per file)',
        'upload.button': 'Select Files',
        'table.title': 'Uploaded Documents',
        'table.delete_selected': 'Delete Selected',
        'table.col.name': 'File Name',
        'table.col.type': 'Type',
        'table.col.doc_type': 'Document Type',
        'table.col.status': 'Status',
        'table.col.confidence': 'Confidence',
        'table.col.uploaded': 'Uploaded',
        'table.col.actions': 'Actions',
        'table.empty': 'No documents uploaded yet. Upload your first document above.',
        'table.pagination.showing': 'Showing {count} items (Page {page})',
        'table.pagination.prev': 'Prev',
        'table.pagination.next': 'Next',
        'action.view': 'View',
        'action.delete': 'Delete',
        'details.title': 'Document Details',
        'details.summary': 'Document Summary',
        'details.dates': 'Extracted Dates',
        'details.amounts': 'Extracted Amounts',
        'details.raw': 'Raw Extracted Data',
        'details.close': 'Close',
        'toast.upload_success': 'Documents uploaded successfully',
        'toast.upload_error': 'Upload failed',
        'toast.delete_success': 'Document deleted',
        'toast.delete_bulk_success': '{count} documents deleted',
        'toast.delete_error': 'Failed to delete document',
        'confirm.delete_title': 'Delete Document',
        'confirm.delete_desc': 'Are you sure you want to delete this document? This action cannot be undone.',
        'confirm.delete_bulk_title': 'Delete Multiple Documents',
        'confirm.delete_bulk_desc': 'Are you sure you want to delete {count} documents? This action cannot be undone.',
        'confirm.cancel': 'Cancel',
        'status.pending': 'Pending',
        'status.processing': 'Processing',
        'status.completed': 'Completed',
        'status.failed': 'Failed',
        'confidence.high': 'HIGH',
        'confidence.medium': 'MEDIUM',
        'confidence.low': 'LOW',
    },
    uk: {
        'user.name': 'Адміністратор',
        'user.role': 'Суперкористувач',
        'nav.documents': 'Документи',
        'nav.dashboard': 'Панель керування',
        'nav.workspace': 'Робочий простір',
        'upload.title': 'Завантаження документів',
        'upload.dropzone': 'Перетягніть PDF, JPG, PNG або WEBP файли сюди',
        'upload.subtitle': 'або натисніть для вибору (макс. 50МБ на файл)',
        'upload.button': 'Обрати файли',
        'table.title': 'Завантажені документи',
        'table.delete_selected': 'Видалити обрані',
        'table.col.name': 'Назва файлу',
        'table.col.type': 'Тип',
        'table.col.doc_type': 'Тип документа',
        'table.col.status': 'Статус',
        'table.col.confidence': 'Точність',
        'table.col.uploaded': 'Завантажено',
        'table.col.actions': 'Дії',
        'table.empty': 'Документи ще не завантажені. Завантажте свій перший документ вище.',
        'table.pagination.showing': 'Показано {count} елементів (Сторінка {page})',
        'table.pagination.prev': 'Назад',
        'table.pagination.next': 'Далі',
        'action.view': 'Переглянути',
        'action.delete': 'Видалити',
        'details.title': 'Деталі документа',
        'details.summary': 'Резюме документа',
        'details.dates': 'Виявлені дати',
        'details.amounts': 'Виявлені суми',
        'details.raw': 'Сирі дані',
        'details.close': 'Закрити',
        'toast.upload_success': 'Документи успішно завантажені',
        'toast.upload_error': 'Помилка завантаження',
        'toast.delete_success': 'Документ видалено',
        'toast.delete_bulk_success': '{count} документів видалено',
        'toast.delete_error': 'Не вдалося видалити документ',
        'confirm.delete_title': 'Видалити документ',
        'confirm.delete_desc': 'Ви впевнені, що хочете видалити цей документ? Цю дію неможливо скасувати.',
        'confirm.delete_bulk_title': 'Видалити декілька документів',
        'confirm.delete_bulk_desc': 'Ви впевнені, що хочете видалити {count} документів? Цю дію неможливо скасувати.',
        'confirm.cancel': 'Скасувати',
        'status.pending': 'Очікує',
        'status.processing': 'Обробка',
        'status.completed': 'Завершено',
        'status.failed': 'Помилка',
        'confidence.high': 'ВИСОКА',
        'confidence.medium': 'СЕРЕДНЯ',
        'confidence.low': 'НИЗЬКА',
    },
};

interface I18nStore {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
}

export const useI18n = create<I18nStore>()(
    persist(
        (set, get) => ({
            language: 'uk', // Default to Ukrainian
            setLanguage: (lang) => set({ language: lang }),
            t: (key: string, params?: Record<string, string | number>) => {
                const lang = get().language;
                let text = translations[lang]?.[key] || translations['en']?.[key] || key;

                if (params) {
                    Object.entries(params).forEach(([k, v]) => {
                        text = text.replace(`{${k}}`, String(v));
                    });
                }

                return text;
            },
        }),
        {
            name: 'admin-lemberg-language',
        }
    )
);
