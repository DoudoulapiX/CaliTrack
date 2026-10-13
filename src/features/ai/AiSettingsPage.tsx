import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { KeyRound } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { checkApiKey, looksLikeApiKey } from '@/content/ai/client'
import { AI_MODEL_OPTIONS, aiModelOption } from '@/content/ai/models'
import { usageOfMonth } from '@/db/ai-usage'
import { deleteSecret, saveSecret } from '@/db/secrets'
import { updateSettings } from '@/db/settings'
import type { AiModel } from '@/db/types'
import { today } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import {
  AI_PROBLEM_TEXT,
  COST_PRIVACY_TEXT,
  DELETE_KEY_TEXT,
  ESTIMATE_NOTE,
  maskKey,
  MONTHLY_PLAN_TEXT,
  monthlyEstimateLines,
  monthUsageText,
} from './ai-view'
import { useAiKey } from './useAiKey'

function Note({ children }: { children: string }) {
  return <p className="mt-2 px-1 text-[13px] text-ink-3">{frenchSpacing(children)}</p>
}

/** Coller sa clé Claude : vérifiée (gratuitement) avant d'être gardée sur l'iPhone. */
function KeyForm() {
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const key = draft.trim()
    if (!looksLikeApiKey(key)) {
      setError(frenchSpacing('Ce n’est pas une clé Claude : elle commence par « sk-ant- ».'))
      return
    }
    setBusy(true)
    try {
      const problem = await checkApiKey(key)
      if (problem === 'invalidKey') {
        setError(
          frenchSpacing('Anthropic refuse cette clé : vérifie qu’elle est complète et toujours active.'),
        )
        return
      }
      await saveSecret('anthropic', key)
      setDraft('')
      toast(problem === null ? 'Clé enregistrée' : 'Clé enregistrée, pas encore vérifiée')
    } catch (e) {
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <TextField
        label="Clé API Claude"
        type="password"
        value={draft}
        placeholder="sk-ant-…"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={error}
        onChange={(value) => {
          setDraft(value)
          setError(null)
        }}
      />
      <Button type="submit" disabled={busy || draft.trim() === ''}>
        {busy ? 'Vérification…' : 'Enregistrer la clé'}
      </Button>
    </form>
  )
}

/** La clé déjà enregistrée : la vérifier ou la supprimer. */
function SavedKey({ apiKey }: { apiKey: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const check = async () => {
    setBusy(true)
    const problem = await checkApiKey(apiKey)
    setBusy(false)
    if (problem === null) toast('Ta clé fonctionne')
    else toast(AI_PROBLEM_TEXT[problem], 'error')
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <div className="flex items-center gap-3">
        <KeyRound size={22} className="shrink-0 text-ink-2" aria-hidden />
        <div className="min-w-0">
          <p className="text-[16px] text-ink">Clé enregistrée</p>
          <p className="text-[13px] text-ink-3 tabular">{maskKey(apiKey)}</p>
        </div>
      </div>
      <Button variant="secondary" disabled={busy} onClick={() => void check()}>
        {busy ? 'Vérification…' : 'Vérifier la clé'}
      </Button>
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        Supprimer la clé
      </Button>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          void deleteSecret('anthropic').then(() => toast('Clé supprimée'))
        }}
        title={frenchSpacing('Supprimer la clé ?')}
        message={DELETE_KEY_TEXT}
        confirmLabel="Supprimer"
      />
    </div>
  )
}

/** Ce que coûte l'IA : un mois d'usage avec chaque modèle, puis les demandes du mois sur cet iPhone. */
function CostAndPrivacy({ model }: { model: AiModel }) {
  const month = today().slice(0, 7)
  // null : aucune demande ce mois-ci ; undefined : lecture en cours.
  const usage = useLiveQuery(async () => (await usageOfMonth(month)) ?? null, [month])

  return (
    <Section title="Coût et confidentialité">
      <p className="rounded-2xl bg-surface p-4 text-[14px] text-ink-2">{COST_PRIVACY_TEXT}</p>
      <div className="mt-3 rounded-2xl bg-surface p-4 text-[14px] text-ink-2">
        <p>{MONTHLY_PLAN_TEXT}</p>
        <ul className="mt-2 flex flex-col gap-1">
          {monthlyEstimateLines(model).map((line) => (
            <li key={line.model} className={line.chosen ? 'font-semibold text-ink' : undefined}>
              {line.text}
            </li>
          ))}
        </ul>
        {usage !== undefined && <p className="mt-3 border-t border-line pt-3">{monthUsageText(usage)}</p>}
      </div>
      <Note>{ESTIMATE_NOTE}</Note>
    </Section>
  )
}

/** Réglages de l'IA : la clé Claude (gardée sur l'iPhone), le modèle utilisé et ce qu'il coûte. */
export function AiSettingsPage() {
  const settings = useSettings()
  const apiKey = useAiKey()

  return (
    <Page title="Intelligence artificielle" back backTo="/more" backLabel="Plus">
      <Section title="Clé Claude">
        {apiKey === undefined ? <PageSpinner /> : apiKey ? <SavedKey apiKey={apiKey} /> : <KeyForm />}
        <Note>
          Crée ta clé sur platform.claude.com, rubrique API Keys. Elle reste sur cet iPhone, hors des
          sauvegardes, et n’est envoyée qu’à Anthropic.
        </Note>
      </Section>
      <Section title="Modèle">
        <Segmented
          label="Modèle"
          value={settings.aiModel}
          onChange={(aiModel) => void updateSettings({ aiModel })}
          options={AI_MODEL_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
        />
        <Note>{aiModelOption(settings.aiModel).hint}</Note>
      </Section>
      <CostAndPrivacy model={settings.aiModel} />
    </Page>
  )
}
