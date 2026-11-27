'use client';

import { useState } from 'react';
import { PivotTable, type PivotFieldDefinition, type PivotLocaleText, type PivotModelInput } from '@salmonui/pivot-table';
import { Checkbox } from '@salmonui/inputs/checkbox';

type Sale = { region: string; country: string; year: string; amount: number };

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'], Americas: ['Brazil', 'Canada'] };

function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let n = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      for (const year of ['2025', '2026']) {
        for (let k = 0; k < 3; k++) {
          n++;
          rows.push({ region, country, year, amount: ((n * 613) % 2400) + 300 });
        }
      }
    }
  }
  return rows;
}

const SALES = makeSales();

// Field captions per language (the headers, the axis bar and the field list).
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
];
const FRENCH_FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Région', type: 'string' },
  { field: 'country', caption: 'Pays', type: 'string' },
  { field: 'year', caption: 'Année', type: 'string' },
  { field: 'amount', caption: 'Montant', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  formats: { amount: { number: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 } } },
};

// A partial French catalog: keys left out keep their English default.
const FRENCH: PivotLocaleText = {
  rowLabels: 'Étiquettes de lignes',
  grandTotal: 'Total général',
  subtotal: 'Total {label}',
  expand: 'Développer {label}',
  collapse: 'Réduire {label}',
  fieldList: 'Liste des champs',
  fields: 'Champs',
  searchFields: 'Rechercher des champs',
  rows: 'Lignes',
  columns: 'Colonnes',
  values: 'Valeurs',
  filters: 'Filtres',
  dropHere: 'Déposez un champ ici',
  apply: 'Appliquer',
  cancel: 'Annuler',
  close: 'Fermer',
  sortAsc: 'Tri croissant',
  sortDesc: 'Tri décroissant',
  filter: 'Filtrer',
  toolbar: "Barre d'outils du tableau croisé",
  totals: 'Totaux',
  export: 'Exporter',
  expandAll: 'Tout développer',
  collapseAll: 'Tout réduire',
};

/** Keyboard and ARIA semantics, localeText with an Intl locale, right to left, and adaptive sheets on small screens. */
export default function PivotTableAccessibilityDemo() {
  const [french, setFrench] = useState(false);
  const [rtl, setRtl] = useState(false);
  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Language and direction">
        <Checkbox checked={french} onCheckedChange={(checked) => setFrench(checked)}>
          French text and fr-FR numbers
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'}>
        <PivotTable<Sale>
          // The locale is read when the store is created: switching it remounts the table.
          key={french ? 'fr' : 'en'}
          data={SALES}
          fields={french ? FRENCH_FIELDS : FIELDS}
          defaultPivotModel={MODEL}
          locale={french ? 'fr-FR' : 'en-US'}
          {...(french ? { localeText: FRENCH } : {})}
          axisBar
          toolbar={['fieldList', 'totals', 'expandAll', 'collapseAll']}
          fieldList="popup"
          drillThrough
          height={300}
          aria-label={french ? 'Ventes par région' : 'Sales by region'}
        />
      </div>
      <p className="demo-status">
        Tab into the table, move with the arrow keys, press Enter on a row header to drill or on a value cell for its raw rows. On the axis bar, Enter opens a field menu
        with "Move to". Narrow the window below 640 px and open the field list: it becomes a full-screen sheet.
      </p>
    </div>
  );
}
