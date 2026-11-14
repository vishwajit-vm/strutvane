import type { ProviderClass } from '#strutvane/foundation'
import { AppServiceProvider } from '../app/providers/app.provider.ts'

/** The app's service providers, Laravel's bootstrap/providers.php. Package installers append here. */
export const providers: ProviderClass[] = [AppServiceProvider]
