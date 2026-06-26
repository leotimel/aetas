import { useTranslation } from 'react-i18next'

const STEP_COUNT = 4

const STEPS = [
  { icon: '👆', titleKey: 'tutorial.step0title' as const, descKey: 'tutorial.step0' as const, arrowClass: 'bottom-full left-8 mb-1' },
  { icon: '🚀', titleKey: 'tutorial.step1title' as const, descKey: 'tutorial.step1' as const, arrowClass: 'bottom-full left-8 mb-1' },
  { icon: '🏛', titleKey: 'tutorial.step2title' as const, descKey: 'tutorial.step2' as const, arrowClass: 'bottom-full left-8 mb-1' },
  { icon: '✅', titleKey: 'tutorial.step3title' as const, descKey: 'tutorial.step3' as const, arrowClass: null },
]

interface Props {
  step: number
  onSkip: () => void
}

export default function TutorialOverlay({ step, onSkip }: Props) {
  const { t } = useTranslation()

  if (step < 0 || step >= STEP_COUNT) return null

  const current = STEPS[step]

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 z-30 w-72 animate-in slide-in-from-bottom-4 duration-300">
      {/* Up arrow for steps 0–2 (point toward the map) */}
      {current.arrowClass && (
        <div className="flex mb-1 pl-4">
          <span className="text-aetas-gold text-lg leading-none animate-bounce select-none">↑</span>
        </div>
      )}

      <div className={`bg-aetas-surface border rounded-2xl p-4 shadow-2xl shadow-black/70 ${
        step === 3 ? 'border-aetas-gold/80' : 'border-aetas-gold/50'
      }`}>
        {/* Title row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">{current.icon}</span>
            <p className="text-aetas-gold font-bold text-sm">{t(current.titleKey)}</p>
          </div>
          <span className="text-aetas-dim text-xs flex-shrink-0">
            {t('tutorial.stepOf', { step: step + 1, total: STEP_COUNT })}
          </span>
        </div>

        {/* Description */}
        <p className="text-aetas-text text-sm leading-relaxed mb-3">
          {t(current.descKey)}
        </p>

        {/* For end-turn step, show a right-arrow hint on desktop */}
        {step === 3 && (
          <p className="text-aetas-gold text-xs font-medium mb-3 hidden md:block">
            → End Turn panel is on the right side
          </p>
        )}

        {/* Progress dots + skip */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === step
                    ? 'bg-aetas-gold'
                    : i < step
                      ? 'bg-aetas-gold/40'
                      : 'bg-aetas-raised'
                }`}
              />
            ))}
          </div>
          <button
            onClick={onSkip}
            className="text-xs text-aetas-dim hover:text-aetas-muted transition-colors px-1"
          >
            {t('tutorial.skip')} ✕
          </button>
        </div>
      </div>
    </div>
  )
}
