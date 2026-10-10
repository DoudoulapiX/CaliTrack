import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Plus, X } from 'lucide-react'
import type { EquipmentKind, Exercise } from '@/db/types'
import { CUSTOM_PREFIX, saveCustomExercise } from '@/db/custom-exercises'
import {
  EQUIPMENT_GROUP_LABEL,
  EQUIPMENT_LABEL,
  EQUIPMENT_PRESETS,
  type EquipmentPreset,
} from '@/content/equipment'
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  LEVEL_LABEL,
  LEVEL_ORDER,
  MUSCLE_LABEL,
  MUSCLE_ORDER,
} from '@/content/exercises/labels'
import { newId } from '@/lib/ids'
import { Button, ButtonLink, IconButton } from '@/ui/Button'
import { ChipGroup, EmptyState, Segmented, Toggle } from '@/ui/Controls'
import { SelectField, TextAreaField, TextField } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import {
  EMPTY_FORM,
  NAME_MAX,
  exerciseFromForm,
  formFromExercise,
  validateForm,
  type ExerciseForm,
} from './exercise-form'
import { useCatalog } from './catalog-context'

const EQUIPMENT_CHOICES: { group: string; options: { value: EquipmentKind; label: string }[] }[] = [
  ...(['calisthenics', 'weights', 'climbing', 'home', 'gym'] as const).map((group) => ({
    group: EQUIPMENT_GROUP_LABEL[group],
    options: EQUIPMENT_PRESETS.filter((p: EquipmentPreset) => p.group === group).map((p) => ({
      value: p.kind,
      label: p.label,
    })),
  })),
  { group: 'Autre', options: [{ value: 'wall', label: EQUIPMENT_LABEL.wall }] },
]

function EquipmentEditor({
  value,
  onChange,
}: {
  value: EquipmentKind[][]
  onChange: (value: EquipmentKind[][]) => void
}) {
  /** Option en cours de modification (value.length : nouvelle option). */
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState<EquipmentKind[]>([])

  const open = (index: number) => {
    setDraft([...(value[index] ?? [])])
    setEditing(index)
  }
  const close = () => {
    setEditing(null)
  }
  const commit = () => {
    if (editing === null) return
    const next = [...value]
    if (draft.length === 0) next.splice(editing, 1)
    else next[editing] = draft
    onChange(next)
    close()
  }

  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        {value.length === 0 && <li className="px-4 py-3 text-[16px] text-ink-2">Aucun matériel</li>}
        {value.map((group, index) => (
          <li key={index} className="flex items-center">
            <button
              type="button"
              className="min-h-13 flex-1 px-4 py-2.5 text-left text-[16px] text-ink active:bg-surface-2"
              onClick={() => {
                open(index)
              }}
            >
              {index > 0 && <span className="mr-1 text-[13px] text-ink-3">ou</span>}
              {group.map((kind) => EQUIPMENT_LABEL[kind]).join(' + ')}
            </button>
            <IconButton
              label="Retirer cette option"
              size="sm"
              className="mr-2"
              onClick={() => {
                onChange(value.filter((_, i) => i !== index))
              }}
            >
              <X size={18} aria-hidden />
            </IconButton>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1"
        icon={<Plus size={16} aria-hidden />}
        onClick={() => {
          open(value.length)
        }}
      >
        {value.length === 0 ? 'Ajouter du matériel' : 'Ajouter une autre option'}
      </Button>
      {value.length > 1 && (
        <p className="px-1 text-[12px] text-ink-3">Plusieurs options : l’une ou l’autre suffit.</p>
      )}

      <Sheet
        open={editing !== null}
        onClose={close}
        title="Matériel nécessaire"
        tall
        footer={
          <Button block size="lg" onClick={commit}>
            Valider
          </Button>
        }
      >
        <p className="mb-4 text-[14px] text-ink-3">
          Coche tout ce qu’il faut en même temps (ex. haltères + banc).
        </p>
        {EQUIPMENT_CHOICES.map(({ group, options }) => (
          <Section key={group} title={group}>
            <ChipGroup
              label={group}
              options={options}
              selected={draft}
              onChange={(selected) => {
                setDraft(selected)
              }}
            />
          </Section>
        ))}
      </Sheet>
    </>
  )
}

function ExerciseFormView({
  initial,
  id,
  base,
  title,
}: {
  initial: ExerciseForm
  id: string
  base: Exercise | null
  title: string
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<ExerciseForm>) => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const save = async () => {
    const problem = validateForm(form)
    setError(problem)
    if (problem) return
    setSaving(true)
    try {
      await saveCustomExercise(exerciseFromForm(form, id, base))
      toast('Exercice enregistré')
      void navigate(`/library/${id}`, { replace: true })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Enregistrement impossible', 'error')
      setSaving(false)
    }
  }

  return (
    <Page
      title={title}
      back
      backLabel="Annuler"
      noTabBar
      footer={
        <Button
          block
          size="lg"
          disabled={saving}
          onClick={() => {
            void save()
          }}
        >
          Enregistrer
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        <TextField
          label="Nom"
          value={form.name}
          maxLength={NAME_MAX}
          error={error}
          autoCapitalize="sentences"
          onChange={(name) => {
            set({ name })
          }}
        />
        <SelectField
          label="Type"
          value={form.category}
          options={CATEGORY_ORDER.map((value) => ({ value, label: CATEGORY_LABEL[value] }))}
          onChange={(category) => {
            set({ category })
          }}
        />
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[13px] font-medium text-ink-2">Niveau</span>
          <Segmented
            label="Niveau"
            value={form.level}
            options={LEVEL_ORDER.map((value) => ({ value, label: LEVEL_LABEL[value] }))}
            onChange={(level) => {
              set({ level })
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[13px] font-medium text-ink-2">Je note</span>
          <Segmented
            label="Je note"
            value={form.measure}
            options={[
              { value: 'reps', label: 'Des répétitions' },
              { value: 'time', label: 'Une durée' },
            ]}
            onChange={(measure) => {
              set({ measure })
            }}
          />
        </div>
        <div className="overflow-hidden rounded-2xl bg-surface">
          <Toggle
            label="Un côté puis l’autre"
            description="Les répétitions se font pour chaque bras ou chaque jambe."
            checked={form.unilateral}
            onChange={(unilateral) => {
              set({ unilateral })
            }}
          />
        </div>

        <Section title="Muscles principaux" className="mb-0">
          <ChipGroup
            label="Muscles principaux"
            options={MUSCLE_ORDER.map((value) => ({ value, label: MUSCLE_LABEL[value] }))}
            selected={form.primary}
            onChange={(primary) => {
              set({ primary, secondary: form.secondary.filter((m) => !primary.includes(m)) })
            }}
          />
        </Section>
        <Section title="Muscles secondaires" className="mb-0">
          <ChipGroup
            label="Muscles secondaires"
            options={MUSCLE_ORDER.filter((m) => !form.primary.includes(m)).map((value) => ({
              value,
              label: MUSCLE_LABEL[value],
            }))}
            selected={form.secondary}
            onChange={(secondary) => {
              set({ secondary })
            }}
          />
        </Section>

        <Section title="Matériel" className="mb-0">
          <EquipmentEditor
            value={form.equipment}
            onChange={(equipment) => {
              set({ equipment })
            }}
          />
        </Section>

        <TextAreaField
          label="Comment faire"
          hint="Une étape par ligne."
          rows={5}
          value={form.steps}
          onChange={(steps) => {
            set({ steps })
          }}
        />
        <TextAreaField
          label="Conseils"
          hint="Un conseil par ligne (facultatif)."
          rows={3}
          value={form.tips}
          onChange={(tips) => {
            set({ tips })
          }}
        />
      </div>
    </Page>
  )
}

export function ExerciseEditPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const catalog = useCatalog()
  // Identifiant tiré une seule fois : un double appui sur « Enregistrer » ne crée pas deux exercices.
  const [createdId] = useState(() => `${CUSTOM_PREFIX}${newId()}`)

  if (id === undefined) {
    const fromId = params.get('from')
    const base = fromId ? (catalog.byId.get(fromId) ?? null) : null
    return (
      <ExerciseFormView
        initial={base ? formFromExercise(base, true) : EMPTY_FORM}
        id={createdId}
        base={base}
        title={base ? 'Ma version' : 'Nouvel exercice'}
      />
    )
  }

  const exercise = catalog.byId.get(id)
  if (exercise?.source !== 'custom') {
    return (
      <Page title="Modifier" back>
        <EmptyState
          title="Cet exercice ne peut pas être modifié"
          text="Seuls tes exercices personnels se modifient. Crée ta version pour l’adapter."
          action={
            exercise ? (
              <ButtonLink to={`/library/new?from=${encodeURIComponent(exercise.id)}`}>
                Créer ma version
              </ButtonLink>
            ) : (
              <ButtonLink to="/library">Voir les exercices</ButtonLink>
            )
          }
        />
      </Page>
    )
  }
  return (
    <ExerciseFormView
      key={exercise.id}
      initial={formFromExercise(exercise, false)}
      id={exercise.id}
      base={exercise}
      title="Modifier l’exercice"
    />
  )
}
