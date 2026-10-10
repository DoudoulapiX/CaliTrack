import { Backpack, HardDriveDownload, Info, Settings2, UserRound } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { ALL_TAB_KEYS, TAB_DEFS, visibleTabs } from '@/app/tabs'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'

export function MorePage() {
  const settings = useSettings()
  const shown = new Set(visibleTabs(settings).map((tab) => tab.key))
  const hiddenTabs = ALL_TAB_KEYS.filter(
    (key) => !shown.has(key) && !(key === 'climbing' && settings.hiddenModules.includes('climbing')),
  ).map((key) => TAB_DEFS[key])

  return (
    <Page title="Plus">
      {hiddenTabs.length > 0 && (
        <Section title="Écrans">
          <ListGroup>
            {hiddenTabs.map((tab) => {
              const Icon = tab.icon
              return (
                <ListRow
                  key={tab.key}
                  title={tab.label}
                  to={tab.to}
                  leading={<Icon size={22} aria-hidden />}
                />
              )
            })}
          </ListGroup>
        </Section>
      )}
      <Section title="Moi">
        <ListGroup>
          <ListRow
            title="Profil et niveau"
            to="/more/profile"
            leading={<UserRound size={22} aria-hidden />}
          />
          <ListRow
            title="Matériel et lieux"
            to="/more/equipment"
            leading={<Backpack size={22} aria-hidden />}
          />
        </ListGroup>
      </Section>
      <Section title="Appli">
        <ListGroup>
          <ListRow
            title="Réglages"
            subtitle="Thème, couleur, onglets, minuteur"
            to="/more/settings"
            leading={<Settings2 size={22} aria-hidden />}
          />
          <ListRow
            title="Sauvegarde"
            subtitle="Enregistrer tes données dans Fichiers"
            to="/more/backup"
            leading={<HardDriveDownload size={22} aria-hidden />}
          />
          <ListRow title="À propos" to="/more/about" leading={<Info size={22} aria-hidden />} />
        </ListGroup>
      </Section>
    </Page>
  )
}
