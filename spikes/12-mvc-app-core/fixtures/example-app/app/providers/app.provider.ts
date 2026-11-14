import { hashToken, UserProviderToken, type AuthUser, type UserProvider } from '#strutvane/auth'
import { ServiceProvider, type Application } from '#strutvane/foundation'
import { Author } from '../models/author.ts'

/** Finds the author who owns a bearer token (tokens are stored as SHA-256 hashes). */
class AuthorTokenProvider implements UserProvider {
  async retrieveByToken(plainToken: string): Promise<AuthUser | null> {
    return Author.findBy('api_token', hashToken(plainToken))
  }
}

/** The app's own provider, Laravel's AppServiceProvider. */
export class AppServiceProvider extends ServiceProvider {
  /** Bind the user provider the `auth` middleware uses. */
  override register(app: Application): void {
    app.container.singleton(UserProviderToken, () => new AuthorTokenProvider())
  }

  /** Sidebar entries for the React UI (hidden there when the user may not `viewAny`). */
  override boot(app: Application): void {
    app.navigation.add({ label: 'Posts', route: 'posts.index', order: 10 })
    app.navigation.add({ label: 'Authors', route: 'authors.index', order: 20 })
  }
}
