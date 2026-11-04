interface ValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  params: Record<string, unknown>;
  message?: string;
}
interface Validator {
  (value: unknown): boolean;
  errors?: ValidationError[] | null;
}
export const status: Validator;
export const core: Validator;
export const events: Validator;
