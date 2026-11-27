// Form Renderer section of examples/vite-spa/inputs.html (?only=form-renderer;
// tests/browser/inputs-form-renderer.spec.ts). Submissions are logged with
// kind 'form-renderer'.
import { FormRenderer, type FormSchema, type FormUiSchema } from '@salmonui/inputs/form-renderer';
import { log, Section } from './inputs-shared.tsx';
import '@salmonui/inputs/form-renderer/styles.css';

const schema: FormSchema = {
  type: 'object',
  title: 'Sign up',
  required: ['first', 'email', 'age', 'plan'],
  properties: {
    first: { type: 'string', title: 'First name', minLength: 2 },
    last: { type: 'string', title: 'Last name', maxLength: 5 },
    email: { type: 'string', title: 'Email', format: 'email', description: 'We never share it' },
    password: { type: 'string', title: 'Password', pattern: '^\\S{4,}$' },
    age: { type: 'integer', title: 'Age', minimum: 18, maximum: 120 },
    plan: { type: 'string', title: 'Plan', enum: ['free', 'pro'] },
    size: { type: 'number', title: 'Team size', enum: [1, 5, 10], default: 5 },
    news: { type: 'boolean', title: 'Newsletter', default: true },
    terms: { type: 'boolean', title: 'I accept the terms', const: true },
  },
};

const ui: FormUiSchema = {
  layout: [['first', 'last'], 'email', 'password', ['age', 'plan']],
  fields: {
    password: { widget: 'password' },
    plan: { enumLabels: ['Free', 'Pro'], placeholder: 'Choose a plan' },
    size: { widget: 'radio', enumLabels: ['Solo', 'Small', 'Team'] },
    news: { widget: 'switch' },
  },
  submit: { label: 'Create account' },
};

export function FormRendererSection() {
  return (
    <Section id="form-renderer" title="Form Renderer">
      <FormRenderer id="frnd-form" schema={schema} uiSchema={ui} style={{ inlineSize: 'min(100%, 36rem)' }} onSubmit={(data, d) => log({ kind: 'form-renderer', data, isValid: d.isValid, errors: d.errors })} />
      <FormRenderer
        id="frnd-aria"
        aria-label="Feedback"
        validationBehavior="aria"
        schema={{ type: 'object', required: ['comment'], properties: { comment: { type: 'string', title: 'Comment' } } }}
        uiSchema={{ fields: { comment: { widget: 'textarea' } }, submit: { label: 'Send feedback' } }}
        onSubmit={(data, d) => log({ kind: 'form-renderer-aria', data, isValid: d.isValid })}
      />
    </Section>
  );
}
