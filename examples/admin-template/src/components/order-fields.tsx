import { Select } from '@salmonui/dropdowns/select';
import { NumberField } from '@salmonui/inputs/number-field';
import { TextField } from '@salmonui/inputs/text-field';
import type { OrderEditValues } from '../api/types';
import { channelOptions, statusOptions } from '../lib/order-display';

export function OrderFields({ initial }: { readonly initial: OrderEditValues }) {
  return (
    <div className="atlas-fields">
      <TextField name="customer" label="客戶" clearable required defaultValue={initial.customer} placeholder="請輸入客戶名稱…" localeText={{ validationRequired: '請輸入客戶名稱' }} />
      <TextField
        name="email"
        label="Email"
       
        clearable
        required
        defaultValue={initial.email}
        placeholder="請輸入 Email…"
        validation={{ email: true }}
        localeText={{ validationRequired: '請輸入 Email', validationEmail: 'Email 格式不正確' }}
      />
      <TextField name="product" label="方案" clearable required defaultValue={initial.product} placeholder="請輸入方案…" localeText={{ validationRequired: '請輸入方案' }} />
      <Select name="channel" label="來源" required defaultValue={initial.channel} data={channelOptions} />
      <NumberField name="amount" label="金額" required min={0} decimals={0} defaultValue={initial.amount} localeText={{ validationRequired: '請輸入金額' }} />
      <Select name="status" label="狀態" required defaultValue={initial.status} data={statusOptions} />
      <TextField name="owner" label="負責人" clearable required defaultValue={initial.owner} placeholder="請輸入負責人…" localeText={{ validationRequired: '請輸入負責人' }} />
    </div>
  );
}
