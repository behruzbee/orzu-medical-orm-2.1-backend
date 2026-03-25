export interface IAuthStrategy {
  validate(payload: any): Promise<any>;
}
