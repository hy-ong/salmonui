// Rating section of examples/vite-spa/inputs.html (?only=rating;
// tests/browser/inputs-rating.spec.ts).
import { Form } from '@salmonui/inputs/form';
import { Rating } from '@salmonui/inputs/rating';
import { log, Section, submitTo } from './inputs-shared.tsx';
import '@salmonui/inputs/form/styles.css';
import '@salmonui/inputs/rating/styles.css';

export function RatingSection() {
  return (
    <Section id="rating" title="Rating">
      <Form id="rat-form" onSubmit={submitTo('rat-form')}>
        <Rating
          id="rat-basic"
          name="stars"
          label="Service"
          description="Five is best"
          defaultValue={2}
          clearable
          showTooltip
          showLabel
          onValueChange={(v, d) => log({ kind: 'rating', value: v, source: d.source, reason: d.reason })}
          onHoverChange={(v) => log({ kind: 'hover', value: v })}
        />
        <Rating id="rat-half" name="half" label="Half" precision="half" defaultValue={2.5} min={1} labelPlacement="start" showLabel renderLabel={({ value, count }) => `${value} / ${count}`} />
        <Rating id="rat-single" label="Single" highlightSelectedOnly defaultValue={3} count={4} />
        <Rating id="rat-custom" label="Custom" icon="♥" emptyIcon="♡" defaultValue={1} count={3} size="sm" />
        <Rating id="rat-items" label="Items" renderItem={({ index, state }) => `${index}${state[0]}`} defaultValue={2} count={3} />
        <Rating id="rat-readonly" label="Read only" readOnly defaultValue={4} />
        <Rating id="rat-exact" label="Average" readOnly precision="exact" defaultValue={3.7} showLabel />
        <Rating id="rat-quarter" label="Quarter" readOnly precision="quarter" defaultValue={2.4} />
        <Rating id="rat-disabled" label="Disabled" disabled defaultValue={2} />
        <button type="submit" id="rat-submit">
          Submit ratings
        </button>
        <button type="reset" id="rat-reset">
          Reset ratings
        </button>
      </Form>
    </Section>
  );
}
