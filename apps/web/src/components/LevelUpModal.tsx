import { useTranslation } from 'react-i18next'
import { CIVILIZATIONS } from '@aetas/game-engine'

interface Props { level: number; onClose: () => void }

export default function LevelUpModal({ level, onClose }: Props) {
  const { t } = useTranslation()
  const newCivs = CIVILIZATIONS.filter(c => c.unlockLevel === level)

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto bg-aetas-surface border border-aetas-gold/50 rounded-2xl shadow-2xl shadow-black/60 p-8 max-w-sm mx-4 text-center anim-fanfare">
          <div className="text-5xl mb-3">⭐</div>
          <h2 className="text-aetas-gold font-bold text-2xl mb-1">{t('levelup.title', { n: level })}</h2>
          <p className="text-aetas-muted text-sm mb-4">{t('levelup.subtitle')}</p>
          {newCivs.length > 0 && (
            <div className="bg-aetas-raised rounded-xl p-3 mb-5">
              <p className="text-xs text-aetas-dim mb-2 uppercase tracking-wider">{t('levelup.unlocked')}</p>
              {newCivs.map(civ => (
                <div key={civ.id} className="flex items-center gap-2 py-1">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: civ.color }} />
                  <span className="text-aetas-text text-sm font-medium">{civ.name}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-aetas-gold text-aetas-bg font-bold text-sm hover:brightness-110 transition-all"
          >
            {t('levelup.continue')}
          </button>
        </div>
      </div>
    </>
  )
}
