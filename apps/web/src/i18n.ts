import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import pt from './locales/pt.json'

const saved   = localStorage.getItem('aetas-lang')
const browser = navigator.language.startsWith('pt') ? 'pt' : 'en'

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pt: { translation: pt },
  },
  lng: saved ?? browser,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
