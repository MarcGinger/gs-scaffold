import { registerAs } from '@nestjs/config';
import { AppConfigUtil } from '../../config/app-config.util';

export default registerAs('security', () => {
  const securityConfig = AppConfigUtil.getSecurityConfig();
  return securityConfig;
});
