import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BookOpen, Trash2 } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import {
  blockUsesLadder,
  findSlot,
  ladderIdFor,
  newSlot,
  removeSlot,
  SLOT_LIMITS,
  updateSlot,
} from '@/content/programs/edit'
import { ladderFor } from '@/content/programs/ladders'
import type { TrainingContext } from '@/content/programs/resolve'
import type { Scheme } from '@/content/programs/schemes'
import { targetForStep } from '@/content/programs/targets'
import { updateProgram } from '@/db/programs'
import type { BlockKind, Exercise, Program, ProgramSlot, SlotTarget } from '@/db/types'
import { userMessage } from '@/lib/errors'
import { formatWeight } from '@/lib/units'
import { Button } from '@/ui/Button'
import { ChoiceChips, Stepper } from '@/ui/Controls'
import { TextAreaField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { ExerciseThumb } from '@/features/library/ExerciseThumb'
import { useCatalog } from '@/features/library/catalog-context'
import { ExercisePicker } from './ExercisePicker'
import { compactDuration, ladderInfo, slotPatch, type SlotDraft } from './program-view'

const NO_LOAD = 'none'

function SettingRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function TargetEditor({ target, onChange }: { target: SlotTarget; onChange: (target: SlotTarget) => void }) {
  const time = target.kind === 'time'
  const [low, high] = time ? SLOT_LIMITS.timeSec : SLOT_LIMITS.reps
  const step = time ? 5 : 1
  const format = (value: number) => (time ? compactDuration(value) : String(value))
  const unit = time ? 'Durée par série' : 'Répétitions par série'
  return (
    <div>
      <p className="text-[15px] font-medium text-ink">{unit}</p>
      <p className="mt-0.5 text-[13px] text-ink-3">
        Quand toutes les séries atteignent le haut de la fourchette, l’exercice progresse.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2/60 py-2">
          <span className="text-[12px] font-semibold text-ink-3 uppercase">Au moins</span>
          <Stepper
            label={`${unit}, au moins`}
            value={target.min}
            min={low}
            max={high}
            step={step}
            format={format}
            onChange={(min) => {
              onChange({ ...target, min, max: Math.max(min, target.max) })
            }}
          />
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface-2/60 py-2">
          <span className="text-[12px] font-semibold text-ink-3 uppercase">Objectif</span>
          <Stepper
            label={`${unit}, objectif`}
            value={target.max}
            min={low}
            max={high}
            step={step}
            format={format}
            onChange={(max) => {
              onChange({ ...target, max, min: Math.min(target.min, max) })
            }}
          />
        </div>
      </div>
    </div>
  )
}

function SlotEditor({
  program,
  slot,
  blockKind,
  context,
  scheme,
  picking,
  onPicking,
  onDone,
}: {
  program: Program
  slot: ProgramSlot
  blockKind: BlockKind
  context: TrainingContext
  scheme: Scheme
  picking: boolean
  onPicking: (picking: boolean) => void
  onDone: () => void
}) {
  const settings = useSettings()
  const catalog = useCatalog()
  const toast = useToast()
  const [draft, setDraft] = useState<SlotDraft>(() => ({
    exerciseId: slot.exerciseId,
    sets: slot.sets,
    target: slot.target,
    loadKg: slot.loadKg,
    restSec: slot.restSec,
    note: slot.note,
  }))
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const exercise = catalog.byId.get(draft.exerciseId)
  // Échauffement, cardio et étirements ne suivent pas de progression.
  const laddered = blockUsesLadder(blockKind)
  const ladderId = laddered ? ladderIdFor(draft.exerciseId, slot.ladderId) : null
  // Progression proposée au choix : celle de l'exercice, sinon celle d'origine du créneau.
  const shownLadderId = laddered ? (ladderId ?? slot.ladderId) : null
  const info = ladderInfo({ ladderId, exerciseId: draft.exerciseId, target: draft.target })
  const next = info?.nextExerciseId ? catalog.byId.get(info.nextExerciseId) : undefined
  const loads = exercise ? context.loadsOf(exercise) : []
  const loadOptions = [...new Set([...loads, ...(draft.loadKg === null ? [] : [draft.loadKg])])].sort(
    (a, b) => a - b,
  )
  const fixed = blockKind === 'warmup' || blockKind === 'cooldown'

  const pick = (chosen: Exercise, stepIndex?: number) => {
    onPicking(false)
    // L'exercice en cours, choisi de nouveau : rien ne change.
    if (chosen.id === draft.exerciseId && (stepIndex === undefined || stepIndex === (info?.step ?? 0) - 1)) {
      return
    }
    const fresh = newSlot(
      chosen,
      blockKind,
      { scheme, loadsOf: context.loadsOf, newId: () => slot.id },
      slot.ladderId,
    )
    // Échelon choisi dans la progression : son objectif à lui (muscle-up : 1, puis 5).
    const shown = ladderFor(shownLadderId)
    const target =
      shown && stepIndex !== undefined && fresh.ladderId === shown.id
        ? targetForStep(shown, stepIndex, chosen, scheme)
        : fresh.target
    setDraft((d) => ({
      ...d,
      exerciseId: chosen.id,
      target,
      loadKg: d.loadKg !== null && context.loadsOf(chosen).includes(d.loadKg) ? d.loadKg : fresh.loadKg,
    }))
  }

  const run = async (action: () => Promise<unknown>, done: string, failure: string) => {
    setSaving(true)
    try {
      await action()
      toast(done)
      onDone()
    } catch (e) {
      setSaving(false)
      toast(userMessage(e, failure), 'error')
    }
  }

  if (picking) {
    return (
      <ExercisePicker
        ladderId={shownLadderId}
        currentId={draft.exerciseId}
        currentStep={info ? info.step - 1 : null}
        kinds={context.kinds}
        onPick={pick}
      />
    )
  }

  const patch = slotPatch(slot, draft)
  const dirty = Object.keys(patch).length > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          {exercise && <ExerciseThumb exercise={exercise} />}
          <div className="min-w-0 flex-1">
            <p className="text-[17px] leading-snug font-semibold text-ink">
              {exercise?.name ?? 'Exercice supprimé'}
            </p>
            {info && (
              <p className="mt-0.5 text-[13px] text-ink-3">
                {info.ladder.name}&nbsp;: étape {info.step} sur {info.total}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onPicking(true)
            }}
          >
            Changer
          </Button>
        </div>
        {next && (
          <p className="mt-3 rounded-xl bg-accent-soft/60 px-3 py-2 text-[13px] text-ink-2">
            Étape suivante&nbsp;: <span className="font-semibold text-ink">{next.name}</span>
          </p>
        )}
        {exercise && (
          <Link
            to={`/library/${exercise.id}`}
            className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent-text"
          >
            <BookOpen size={16} aria-hidden />
            Voir la fiche
          </Link>
        )}
      </div>

      <SettingRow label="Séries">
        <Stepper
          label="Séries"
          value={draft.sets}
          min={SLOT_LIMITS.sets[0]}
          max={SLOT_LIMITS.sets[1]}
          onChange={(sets) => {
            setDraft((d) => ({ ...d, sets }))
          }}
        />
      </SettingRow>

      <TargetEditor
        target={draft.target}
        onChange={(target) => {
          setDraft((d) => ({ ...d, target }))
        }}
      />

      {!fixed && loadOptions.length > 0 && (
        <div>
          <p className="mb-2 text-[15px] font-medium text-ink">Charge</p>
          <ChoiceChips
            label="Charge"
            value={draft.loadKg === null ? NO_LOAD : String(draft.loadKg)}
            options={[
              { value: NO_LOAD, label: 'Sans charge' },
              ...loadOptions.map((kg) => ({
                value: String(kg),
                label: formatWeight(kg, settings.weightUnit),
              })),
            ]}
            onChange={(value) => {
              setDraft((d) => ({ ...d, loadKg: value === NO_LOAD ? null : Number(value) }))
            }}
          />
        </div>
      )}

      <SettingRow label="Repos" hint="Entre deux séries">
        <Stepper
          label="Repos entre les séries"
          value={draft.restSec}
          min={SLOT_LIMITS.restSec[0]}
          max={SLOT_LIMITS.restSec[1]}
          step={15}
          format={(sec) => (sec === 0 ? 'Aucun' : compactDuration(sec))}
          onChange={(restSec) => {
            setDraft((d) => ({ ...d, restSec }))
          }}
        />
      </SettingRow>

      <TextAreaField
        label="Note"
        value={draft.note}
        onChange={(note) => {
          setDraft((d) => ({ ...d, note }))
        }}
        placeholder="Prise, réglage, sensation…"
        maxLength={500}
      />

      <div className="flex flex-col gap-2">
        <Button
          block
          size="lg"
          disabled={!dirty || saving}
          onClick={() =>
            void run(
              () => updateProgram(program.id, (p) => updateSlot(p, slot.id, patch)),
              'Exercice enregistré',
              'Enregistrement impossible.',
            )
          }
        >
          Enregistrer
        </Button>
        {confirmRemove ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-danger/10 p-3">
            <p className="text-[14px] text-ink-2">Retirer cet exercice de la séance&nbsp;?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirmRemove(false)
                }}
              >
                Annuler
              </Button>
              <Button
                variant="danger"
                disabled={saving}
                onClick={() =>
                  void run(
                    () => updateProgram(program.id, (p) => removeSlot(p, slot.id)),
                    'Exercice retiré',
                    'Impossible de retirer cet exercice.',
                  )
                }
              >
                Retirer
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            block
            className="text-danger"
            icon={<Trash2 size={18} aria-hidden />}
            onClick={() => {
              setConfirmRemove(true)
            }}
          >
            Retirer de la séance
          </Button>
        )}
      </div>
    </div>
  )
}

/** Feuille de réglage d'un exercice du programme (ouverte quand `slotId` est donné). */
export function SlotSheet({
  program,
  slotId,
  onClose,
  context,
  scheme,
}: {
  program: Program
  slotId: string | null
  onClose: () => void
  context: TrainingContext
  scheme: Scheme
}) {
  const [picking, setPicking] = useState(false)
  const found = slotId ? findSlot(program, slotId) : null
  const close = () => {
    setPicking(false)
    onClose()
  }
  return (
    <Sheet
      open={found !== null}
      onClose={close}
      title={picking ? 'Changer d’exercice' : (found?.block.title ?? 'Exercice')}
      tall
      scrollKey={picking ? 'picker' : 'editor'}
    >
      {found && (
        <SlotEditor
          key={found.slot.id}
          program={program}
          slot={found.slot}
          blockKind={found.block.kind}
          context={context}
          scheme={scheme}
          picking={picking}
          onPicking={setPicking}
          onDone={close}
        />
      )}
    </Sheet>
  )
}
