import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IUserToken } from 'src/shared/auth';

export class UserTokenRequest implements IUserToken {
  /**
   * the tenant reference for this person
   * This is only available for inter-service calls. Using this field as a client will result in an error.
   */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  readonly tenant?: string;

  /**
   * This field represents the subject of the token, which typically refers to the identity of the user or client associated with the token.
   * This is only available for inter-service calls. Using this field as a client will result in an error.
   */
  @IsOptional()
  @IsString()
  @MaxLength(36)
  readonly sub: string;

  /**
   * This field represents the name of the user or client associated with the token.
   * This is only available for inter-service calls. Using this field as a client will result in an error.
   */
  @IsOptional()
  @IsString()
  readonly name: string;

  /**
   * This field represents the email address of the user or client associated with the token.
   * This is only available for inter-service calls. Using this field as a client will result in an error.
   */
  @IsOptional()
  @IsString()
  readonly email: string;

  @IsOptional()
  @IsString()
  readonly preferred_username?: string;

  @IsOptional()
  @IsString()
  readonly tenant_id?: string;
}
