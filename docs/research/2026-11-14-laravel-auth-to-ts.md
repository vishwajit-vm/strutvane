# Laravel auth, mapped to a TypeScript Strutvane (research, 2026-11-14)

> **Status:** research input, not a decision. Nothing here changes D1–D24 or any ADR. Section 9 lists every conflict with current decisions that would need a new ADR before any of this is built.
> **Scope:** authentication and authorization only, for the planned rebuild that copies Laravel's flow and ecosystem (npm only, MVC/monolithic app).
> **Method:** official Laravel docs (13.x, the current major), the Laravel GitHub repos (starter kits, installer, Fortify, Sanctum, Passport, framework) and the Packagist/npm registries, all read on **2026-11-14**. A fact I could not check at the source is marked *(unverified)*.
> **Read-only reuse analysis** of `packages/auth` at `0.1.0-next.0` (README, CLAUDE.md, `src/index.ts`, `src/config.ts`, `src/provider.ts`, `src/identity/*`, `migrations/postgres/*`).

---

## 0. Summary in one screen

- In 2026, Laravel's auth story is: the **framework** holds the primitives (guards, sessions, hashing, password broker, email verification, Gate and policies); **Fortify** is the headless backend (routes plus actions); the **starter kits** (React, Svelte, Vue, Livewire, each with an optional WorkOS variant and optional teams) put owned pages and settings controllers into the app; **Sanctum** handles API tokens and SPA cookies; **Passport** is the OAuth2 server; **Socialite** handles social sign-in. **Breeze and Jetstream are frozen**: they get no further updates after Laravel 12.
- What a developer does: `laravel new app` → pick stack → pick auth provider → teams? → `npm install && npm run build` → `composer run dev`. Login, register, password reset, email verification, 2FA, passkeys, password confirmation and profile/security settings all work immediately. Routes are protected with `auth` / `verified` / `can:` middleware, and resources get `make:policy --model`.
- **Proposal:** `npm create strutvane@latest` asks the same questions. The default install puts a Fortify-plus-Sanctum equivalent into `@strutvane/auth` (session guard, features array, personal access tokens, policies, role map). Social sign-in, the OAuth2 server and enterprise SSO are add-ons. Tables are ordinary app migrations, written at create or install time and applied by `npx strutvane migrate`. Policies are per-model classes in `app/policies/`, auto-discovered by file name, and still compile to SQL for list queries. That last point is Strutvane's edge over Laravel, which filters lists by hand.
- **Reuse:** keep the policy → SQL engine, the role map, field rules, tenancy and RLS, the rate limiter, client-IP and origin hardening, audit and the identity contract tests. Adapt the provider's JSON endpoints to Fortify-style routes and make the in-memory native engine persistent. Retire the Better Auth default engine, its camelCase tables, `auth:migration`, the "no User model" stance and boot-time admin seeding (each needs an ADR, see §9).

---

## 1. Versions and sources (checked 2026-11-14)

| Component | Current version (release date) | Source |
|---|---|---|
| Laravel framework | 13.42.0 (2026-11-10); Laravel 13 released 2026-03-17, security fixes until 2028-03-17 | repo.packagist.org `laravel/framework`; laravel.com/docs/13.x/releases |
| Laravel installer | 5.33.0 (2026-11-10) | Packagist `laravel/installer`; `src/NewCommand.php` |
| Fortify | 1.42.0 (2026-10-21) | Packagist; laravel.com/docs/fortify |
| Sanctum | 4.4.0 (2026-11-02) | Packagist; laravel.com/docs/sanctum |
| Passport | 13.11.0 (2026-10-14) | Packagist; laravel.com/docs/passport |
| Socialite | 5.32.0 (2026-11-10) | Packagist; laravel.com/docs/socialite |
| laravel/passkeys | 0.3.0 (2026-11-10), wrapped by Fortify | Packagist; Fortify docs § Passkeys |
| laravel/workos | 0.6.0 (2026-02-19) | Packagist |
| Breeze | 2.4.2 (2026-05-14), **frozen** | Packagist; Laravel 12 release notes |
| Jetstream | 5.5.3 (2026-05-19), **frozen**, README: "for Laravel 11.x and prior" | Packagist; github.com/laravel/jetstream |
| React starter kit | `main` branch; also `teams`, `workos` and `workos-teams` branches | github.com/laravel/react-starter-kit |

npm candidates for the TS design (registry.npmjs.org, 2026-11-14): `better-auth` 1.7.23 (2026-11-13, MIT), `arctic` 3.7.0 (2025-05-21, MIT, **no release for about 18 months**), `@node-rs/argon2` 2.2.2 (2026-10-06), `@node-rs/bcrypt` 2.0.0 (2026-10-06), `otpauth` 9.6.0 (2026-11-02), `@simplewebauthn/server` 14.1.0 (2026-11-06), `oidc-provider` 9.15.0 (2026-11-13), `@jmondi/oauth2-server` 5.0.0 (2026-08-21), `hono` 4.13.18 (2026-11-11). All are MIT.

---

## 2. The Laravel auth landscape in 2026

### 2.1 Who does what

| Layer | Laravel piece | Where the code lives |
|---|---|---|
| Primitives | `Illuminate\Auth` (guards, `Auth` facade, user providers, password broker, `MustVerifyEmail`, `verified` / `auth` / `password.confirm` / `auth.session` middleware), `Hash`, `Session`, `RateLimiter`, `PreventRequestForgery` (CSRF), Gate and policies | `laravel/framework`. A fresh app already has the `users`, `password_reset_tokens` and `sessions` tables in `0001_01_01_000000_create_users_table.php` |
| Headless auth backend | **Fortify**: registers `/login`, `/register`, `/forgot-password`, `/reset-password`, `/email/verify…`, `/user/confirm-password`, `/two-factor-challenge`, 2FA management, passkeys, profile and password update | package; the app owns `config/fortify.php`, `app/Providers/FortifyServiceProvider.php` and `app/Actions/Fortify/*` |
| UI scaffolding | **Starter kits** (Laravel 12+): React / Svelte / Vue (Inertia 3 + shadcn) and Livewire 4 (Flux UI). Each has a WorkOS variant and an optional teams variant | 100% owned code in the app; "there is no need to update the starter kit itself" (starter-kits FAQ) |
| API auth | **Sanctum**: personal access tokens with abilities, plus first-party SPA cookie auth | package plus the `personal_access_tokens` migration, via `php artisan install:api` |
| OAuth2 server | **Passport** (on League OAuth2 Server) | package plus `oauth_*` migrations, via `php artisan install:api --passport` *(flag spelling unverified; the docs show `install:api` for Passport)* |
| Social sign-in | **Socialite** (OAuth client) | package; the developer writes two routes and the user upsert |
| Legacy | **Breeze** (minimal: Blade / Livewire / React / Vue / API + Next.js), **Jetstream** (2FA, sessions, Sanctum API tokens, teams; Livewire or Inertia) | Frozen. Laravel 12 notes: "Laravel Breeze and Laravel Jetstream will no longer receive additional updates." |

### 2.2 The create flow (`laravel new`)

From `laravel/installer` `src/NewCommand.php`, read 2026-11-14:

1. "Do you want to use a starter kit?"
2. "Which frontend stack…": `react`, `svelte`, `vue`, `livewire`, plus `blade` (no scaffolding) when no kit is chosen.
3. "Which authentication provider do you prefer?": `laravel` ("Laravel's built-in authentication", the default) or `workos` ("Requires WorkOS account").
4. (Livewire) single-file components?
5. "Would you like to add teams support to your application?"
6. Testing framework (Pest or PHPUnit), Laravel Boost (AI tooling), database.

Flags: `--react --svelte --vue --livewire --workos --teams --no-authentication --pest --phpunit --npm --pnpm --bun --yarn --no-node --database= --using=vendor/kit`.

The starter kit also runs an `install:features` command (`app/Console/Commands/InstallFeaturesCommand.php` plus `chisel.php`). It asks **"Which authentication features would you like to enable?"** with the options `email-verification`, `registration`, `2fa`, `passkeys`, `password-confirmation`, then **removes the unused code**, which is marked with `/* @chisel-… */` comments. This "generate everything, then strip what you didn't pick" approach is worth copying: the code stays owned and minimal.

Then: `cd my-app && npm install && npm run build && composer run dev` → http://localhost:8000.

### 2.3 Fortify in detail (docs 13.x, Fortify 1.42.0)

- **Install** (without a kit): `composer require laravel/fortify`, `php artisan fortify:install` (publishes `app/Actions/Fortify/*`, `FortifyServiceProvider`, `config/fortify.php` and migrations), then `php artisan migrate`.
- **Features array** in `config/fortify.php`: `Features::registration()`, `resetPasswords()`, `emailVerification()`, `twoFactorAuthentication(['confirm' => true, 'confirmPassword' => true])`, `passkeys(['confirmPassword' => true])` (plus profile and password update features). To disable a feature, remove its entry. The kits use Wayfinder (typed routes), so you must also delete frontend references to routes you removed, or the build fails.
- **Config keys** (`fortify/config/fortify.php`): `guard` (`web`), `middleware` (`['web']`), `auth_middleware`, `passwords`, `username` (`email`), `email`, `views` (`true`; `false` for SPAs), `home` (`/home`), `prefix`, `domain`, `lowercase_usernames`, `limiters.login` / `limiters.passkeys`, and `paths.*` to rename every route.
- **Routes** (starter-kits docs table): `GET|POST /login`, `POST /logout`, `GET|POST /register`, `GET|POST /forgot-password`, `GET /reset-password/{token}`, `POST /reset-password`, `GET /email/verify`, `GET /email/verify/{id}/{hash}`, `POST /email/verification-notification`, `GET|POST /user/confirm-password`, `GET|POST /two-factor-challenge`. 2FA management: `POST /user/two-factor-authentication`, `POST /user/confirmed-two-factor-authentication`, `GET /user/two-factor-qr-code` (JSON `{svg}`), `GET|POST /user/two-factor-recovery-codes`.
- **Dual responses:** a form post gets a redirect with a session `status`; an XHR call gets JSON (200, 204, 202 or 422). One backend serves both Blade and SPA front ends.
- **Customisation points:** `Fortify::loginView(...)` and the other `*View` callbacks (the kits return `Inertia::render('auth/login', …)`); `Fortify::authenticateUsing(fn (Request) => ?User)`; `Fortify::authenticateThrough(...)`, whose default pipeline is `EnsureLoginIsNotThrottled → CanonicalizeUsername → RedirectIfTwoFactorAuthenticatable → AttemptToAuthenticate → PrepareAuthenticatedSession`; `LoginResponse` / `LogoutResponse` container bindings; and actions `CreateNewUser`, `ResetUserPassword`, `PasswordValidationRules` (the docs' example adds a `phone` field by editing `CreateNewUser`).
- **2FA:** TOTP, 6 digits. The `TwoFactorAuthenticatable` trait on `User` adds the columns `two_factor_secret`, `two_factor_recovery_codes` (text, encrypted) and `two_factor_confirmed_at`. There are **8 recovery codes**, each `Str::random(10).'-'.Str::random(10)` (Fortify source). With `confirm`, 2FA is active only after a valid code. An XHR login returns `{ two_factor: true }`.
- **Passkeys** (new): WebAuthn via `laravel/passkeys`; `PasskeyUser` + `PasskeyAuthenticatable`; config `relying_party_id`, `allowed_origins`, `user_handle_secret`, `timeout`; a `passkeys` table (`user_id`, `name`, `credential_id` unique, `credential` json, `last_used_at`); JS client `@laravel/passkeys`; its own rate limiter.
- **Password confirmation:** the `password.confirm` middleware; `auth.password_timeout` defaults to **10800 s (3 h)** (`config/auth.php`).

### 2.4 Starter kit file layout (React kit, `main`, 2026-11-14)

```
app/Actions/Fortify/CreateNewUser.php, ResetUserPassword.php
app/Concerns/PasswordValidationRules.php, ProfileValidationRules.php
app/Http/Controllers/Settings/ProfileController.php, SecurityController.php
app/Http/Requests/Settings/{PasswordUpdate,ProfileDelete,ProfileUpdate,TwoFactorAuthentication}Request.php
app/Http/Middleware/HandleInertiaRequests.php   ← shares auth.user (and permissions) with every page
app/Models/User.php
app/Providers/FortifyServiceProvider.php         ← views, actions, rate limiters
config/fortify.php
database/migrations/0001_01_01_000000_create_users_table.php      (users, password_reset_tokens, sessions)
database/migrations/0001_01_01_000001_create_cache_table.php      (cache: the rate limiter's store)
database/migrations/0001_01_01_000002_create_jobs_table.php       (queued mail)
database/migrations/2024_01_01_000000_create_passkeys_table.php
database/migrations/2025_08_14_170933_add_two_factor_columns_to_users_table.php
resources/js/pages/auth/{login,register,forgot-password,reset-password,verify-email,confirm-password,two-factor-challenge}.tsx
resources/js/pages/settings/{profile,security,appearance}.tsx, dashboard.tsx, welcome.tsx
routes/web.php, routes/settings.php
```

`routes/settings.php`: `settings/profile` (GET/PATCH, `auth`), `DELETE settings/profile` and `settings/security`, `PUT settings/password` (`auth`, `verified`), `settings/appearance`, plus `/.well-known/passkey-endpoints`.

Rate limiters set in the kit's `FortifyServiceProvider`:
- `login`: `Limit::perMinute(5)->by(lower(email)|ip)`
- `two-factor`: `perMinute(5)` by `session('login.id')`
- `passkeys`: `perMinute(10)` by `credential.id` (or session id) plus ip

### 2.5 Teams (starter kit `teams` branch)

- **Tables:** `teams` (`name`, `slug` unique, `is_personal`, soft deletes), `team_members` (`team_id`, `user_id`, `role`, unique pair), `team_invitations` (`code` unique 64, `team_id`, `email`, `role`, `invited_by`, `expires_at`, `accepted_at`), and `users.current_team_id`.
- **Roles are code, not data:** the `TeamRole` enum has `owner`, `admin` and `member` with a `permissions()` map (owner: all; admin: UpdateTeam, CreateInvitation, CancelInvitation; member: none), `level()` / `isAtLeast()`, and `assignable()` (never owner).
- **Behaviour:** registration creates a personal team. Scoped URLs look like `/{current_team}/dashboard` and `settings/teams/{team}`. `EnsureTeamMembership` middleware checks the user belongs to the team, and `SetTeamUrlDefaults` fills in `route('dashboard')`. Reserved team names (`settings`, `login`, `dashboard`…) are refused. There are `TeamPolicy`, invitation notifications and a prune command for expired invitations.
- **Jetstream** (legacy) had the same idea with `Jetstream::role(...)` permission sets.

### 2.6 WorkOS AuthKit variant

`laravel new` with `--workos` replaces Fortify's password flows with WorkOS AuthKit: social sign-in (Google, Microsoft, GitHub, Apple), passkeys, "Magic Auth" (email codes) and SSO. You configure `WORKOS_CLIENT_ID`, `WORKOS_API_KEY` and `WORKOS_REDIRECT_URL="${APP_URL}/authenticate"`. The docs recommend turning off email + password in WorkOS so the app never handles passwords. The WorkOS variant needs no email verification.

### 2.7 Sanctum (4.4.0)

- **Install:** `php artisan install:api` publishes the `personal_access_tokens` table (`tokenable` morph, `name`, `token` varchar 64 unique (SHA-256), `abilities` text, `last_used_at`, `expires_at` indexed, timestamps) and `routes/api.php`.
- **Tokens:**
  - `$user->createToken($name, $abilities = ['*'], $expiresAt)` returns `plainTextToken` = `"{id}|{prefix}{random40}{crc32b}"`. Only the SHA-256 of the secret part is stored (Sanctum `HasApiTokens`).
  - `token_prefix` (`SANCTUM_TOKEN_PREFIX`) helps secret scanners recognise tokens.
  - `expiration` is `null` by default (tokens never expire); `sanctum:prune-expired --hours=24` cleans up.
- **Abilities:** `tokenCan` / `tokenCant`, plus the middleware `abilities:a,b` (all of) and `ability:a,b` (any of). **For first-party cookie requests, `tokenCan` always returns `true`**, so policies can check abilities whether a request came from the UI or the API, and the policy still decides.
- **Guard:** `auth:sanctum` tries the session cookie first (only for "stateful" first-party domains), then a `Bearer` token.
- **SPA mode** (no tokens):
  - Same top-level domain.
  - `statefulApi()` middleware; `stateful` domains (`SANCTUM_STATEFUL_DOMAINS`).
  - `GET /sanctum/csrf-cookie` sets `XSRF-TOKEN`; the client echoes it back as `X-XSRF-TOKEN`.
  - CORS `supports_credentials`; session cookie domain `.domain.com`.
  - Expired session → 401/419.
- **Mobile:** a hand-written `POST /sanctum/token` (email, password, `device_name`) that returns a token.
- **Testing:** `Sanctum::actingAs($user, ['view-tasks'])`.

### 2.8 Passport (13.11.0)

- **Install:** `php artisan install:api` (Passport variant) creates keys and migrations; `User implements OAuthenticatable`, `use HasApiTokens`; the `api` guard uses `driver => passport`.
- **Tables:** `oauth_auth_codes`, `oauth_access_tokens`, `oauth_refresh_tokens`, `oauth_clients`, `oauth_device_codes`.
- **Grants:**
  - authorization code (+ PKCE with `passport:client --public`)
  - device authorization
  - client credentials (`EnsureClientIsResourceOwner`)
  - refresh
  - personal access tokens
- **Password and implicit grants:** "We no longer recommend…". They are opt-in through `enablePasswordGrant()` / `enableImplicitGrant()`.
- **Scopes:** `Passport::tokensCan([...])` with descriptions shown on the consent screen; middleware `CheckToken::using(...)` (all) and `CheckTokenForAnyScope` (any).
- **Lifetimes:** one year by default; `tokensExpireIn` / `refreshTokensExpireIn` / `personalAccessTokensExpireIn`.
- **Views:** `Passport::authorizationView(...)` (an Inertia page works), and device user-code and authorize views.
- **Commands:** `passport:client`, `passport:purge [--revoked|--expired --hours=6]`.
- **Laravel's own guidance:** use Passport only if you "absolutely" need OAuth2; otherwise use Sanctum.

### 2.9 Socialite (5.32.0)

- **Built-in providers:** Facebook, X, LinkedIn (`linkedin-openid`), Google, GitHub, GitLab, Bitbucket, Slack (`slack`, `slack-openid`). Others, **Microsoft included**, come from the community socialiteproviders.com.
- **Setup:** credentials go in `config/services.php` (`client_id`, `client_secret`, `redirect`). The developer writes two routes:

  ```php
  Route::get('/auth/redirect', fn () => Socialite::driver('github')->redirect());
  Route::get('/auth/callback', function () {
      $u = Socialite::driver('github')->user();
      $user = User::updateOrCreate(['github_id' => $u->id], [...tokens...]);
      Auth::login($user);
  });
  ```

- **Other API:** `scopes()` / `setScopes()`, `with([...])` (never `state`), `stateless()`, `userFromToken()`, `Socialite::fake()` for tests.
- **Storage:** none provided. Columns like `github_id` / `github_token` go on `users`, and account linking is up to you.

### 2.10 Authorization (docs 13.x)

- **Gates:** `Gate::define('update-post', fn (User $u, Post $p) => …)` in `AppServiceProvider::boot`; `allows` / `denies` / `any` / `none` / `check` / `authorize` (throws → 403) / `inspect` (returns a `Response` with its message); `Response::allow()` / `deny('msg')` / `denyWithStatus(404)` / `denyAsNotFound()`; `Gate::before` (a non-null result wins) and `Gate::after`; inline `Gate::allowIf` / `denyIf`.
- **Policies:**
  - `php artisan make:policy PostPolicy --model=Post` stubs `viewAny`, `view`, `create`, `update`, `delete`, `restore`, `forceDelete`.
  - **Auto-discovery:** `app/Models/Post` → `app/Models/Policies/PostPolicy` or `app/Policies/PostPolicy` (by name). Overrides: `Gate::guessPolicyNamesUsing`, `Gate::policy(Order::class, OrderPolicy::class)`, or the `#[UsePolicy(OrderPolicy::class)]` attribute.
  - A `before(User, string $ability): ?bool` filter runs only if the policy has the method being checked.
  - Guests: everything is `false` unless the `User` parameter is nullable (`?User`).
  - Extra context: `Gate::authorize('update', [$post, $category])`.
- **Where you check:**
  - `$user->can('update', $post)` / `cannot`
  - `Gate::authorize('create', Post::class)`
  - route middleware `->can('update', 'post')` / `can:update,post`
  - controller attribute `#[Authorize('update', 'post')]` (new in 13)
  - Blade `@can` / `@cannot` / `@canany`
  - for Inertia: share booleans from `HandleInertiaRequests::share()` (`auth.permissions.post.create`)
- **No role or permission model ships with Laravel.** Teams kits use code enums. Apps commonly add a community package for DB-stored roles *(spatie/laravel-permission; not checked today)*.
- **List filtering is manual.** Laravel has no policy-to-query bridge; developers write Eloquent scopes by hand. **This is the gap Strutvane's policy → SQL compiler fills.**

### 2.11 Supporting primitives

| Topic | Laravel default (13.x) | Source |
|---|---|---|
| Users table | `id`, `name`, `email` unique, `email_verified_at`, `password`, `remember_token` (100), timestamps | `laravel/laravel` 13.x migration |
| Password hashing | **bcrypt**, rounds 12 (`BCRYPT_ROUNDS`); `argon` and `argon2id` drivers; **automatic rehash on login** (`rehash_on_login`) | hashing.md, authentication.md |
| Password rule | `Password::min` defaults to 8 | framework `Validation/Rules/Password.php` |
| Sessions | `config/session.php`, default driver **`database`** (`sessions` table: `id`, `user_id`, `ip_address`, `user_agent`, `payload`, `last_activity`); also `file`, `cookie` (encrypted), `redis`, `memcached`, `dynamodb`, `array` (tests) | session.md |
| Login | `Auth::attempt($creds, $remember)` then **`$request->session()->regenerate()`** (fixation) | authentication.md |
| Logout | `Auth::logout()`, `session()->invalidate()`, `session()->regenerateToken()` | authentication.md |
| Remember me | `remember_token` column; the token is refreshed on remember-login and on logout; `Auth::viaRemember()` | authentication.md |
| Other devices | `auth.session` middleware plus `Auth::logoutOtherDevices($currentPassword)` | authentication.md |
| Guests | the `auth` middleware redirects to the `login` named route; `redirectGuestsTo(...)` | authentication.md |
| Login throttle | the kits: 5/min per (email, IP); throttling is "unique to the user's username / email address and their IP address" | authentication.md, kit provider |
| Password reset | `password_reset_tokens` (email PK, **hashed** token, `created_at`); `expire` 60 min, `throttle` 60 s; `auth:clear-resets` | passwords.md, `DatabaseTokenRepository`, `config/auth.php` |
| Email verification | `MustVerifyEmail`; routes `verification.notice`, `verification.verify` (`auth` + **`signed`** URL), `verification.send` (`throttle:6,1`); the `verified` middleware; `Verified` event. Link lifetime is `auth.verification.expire`, default 60 min *(unverified)* | verification.md |
| CSRF | **`PreventRequestForgery`** (new name in 13): first checks **`Sec-Fetch-Site`** (same-origin passes), then falls back to the token (`_token`, `X-CSRF-TOKEN`, or the `XSRF-TOKEN` cookie echoed as `X-XSRF-TOKEN`); `originOnly: true` → 403 instead of 419; `allowSameSite`; `except` | csrf.md, 13.x release notes |
| Events | `Registered`, `Login`, `Failed`, `Logout`, `Lockout`, `PasswordReset`, `Verified`, … | authentication.md § Events |

---

## 3. "I want X": the Laravel recipe

| Goal | What the developer types | What appears / what they edit |
|---|---|---|
| Sign up, sign in, sign out, password reset, email verification | `laravel new app` → React → Laravel auth (+ teams?) → `npm install && npm run build` → `composer run dev` | everything in §2.4. Email verification: implement `MustVerifyEmail` on `User`, add `verified` to routes |
| Add a profile field | edit `app/Actions/Fortify/CreateNewUser.php` plus a migration plus `pages/auth/register.tsx` | — |
| Turn registration off | remove `Features::registration()` (and the frontend links) | — |
| Protect a route | `Route::middleware(['auth', 'verified'])->group(...)` | — |
| Re-confirm the password for sensitive actions | `->middleware('password.confirm')` | the kit page `auth/confirm-password` |
| Authorize a model | `php artisan make:policy PostPolicy --model=Post` → edit methods → `Gate::authorize('update', $post)` / `->can('update','post')` / `@can` | `app/Policies/PostPolicy.php` (auto-discovered) |
| Admin can do everything | `Gate::before(fn ($u) => $u->isAdmin() ? true : null)` | `AppServiceProvider` |
| API tokens | `php artisan install:api` → `HasApiTokens` on `User` → `$user->createToken('cli', ['post:read'])` → `auth:sanctum` + `abilities:` | `personal_access_tokens`, `routes/api.php`, `config/sanctum.php` |
| SPA on a subdomain | `statefulApi()`, `SANCTUM_STATEFUL_DOMAINS`, CORS credentials, `/sanctum/csrf-cookie` | `bootstrap/app.php`, `config/cors.php` |
| Social login | `composer require laravel/socialite` → `config/services.php` → two routes → `updateOrCreate` → `Auth::login` | `users.github_id` columns (by hand) |
| OAuth2 provider for third parties | `install:api` (Passport) → `passport:client` → `Passport::tokensCan` → consent view | `oauth_*` tables |
| Teams and roles | `laravel new --teams` | §2.5 files; roles in the `TeamRole` enum |
| Enterprise SSO | `laravel new --workos` | WorkOS env keys |

---

## 4. Design principles for the TypeScript version

1. **Copy the flow, not PHP idioms.** Same questions at create time, same route names and URLs, same middleware names (`auth`, `guest`, `verified`, `can`, `password.confirm`, `abilities`, `ability`, `throttle`), same file roles (actions, policies, providers, settings controllers, pages). This means no traits, no facades as static globals, and no decorators (D-rule: no decorators or reflection).
2. **Owned code by default.** Pages, actions, settings controllers, policies, migrations and the `User` model are written into the app and never regenerated. Package code is the engine only, which is Fortify's split exactly.
3. **One session concept.** The framework's session (flash, old input, CSRF token, intended URL) carries the user id, as in Laravel. There is no second "auth session" store.
4. **Strutvane's security defaults stay stronger than Laravel's** where it already proved them (§7.3). Parity in *flow*, never regression in *defaults*.
5. **One migrate command.** Auth tables are normal migration files in `database/migrations/`, written by `create` or `install:*`. `npx strutvane migrate` applies them. There is no `auth:migration`.
6. **npm only.** Every command is `npm …` / `npx strutvane …` (see §9 for the conflict with the current pnpm rule).

---

## 5. The design

### 5.1 Layering: Laravel piece → Strutvane piece

| Laravel | Strutvane (proposed) | Default? |
|---|---|---|
| framework: guards, `Auth`, session, hashing, password broker, verification, `Gate` and policies, CSRF, rate limiter, signed URLs | **`@strutvane/framework`** owns session, cookies, CSRF, hashing, signed URLs, cache-backed rate limiter and mail. **`@strutvane/auth`** owns the guard, `Gate`, policies and the role map (or the framework owns them; see §9 C2) | yes |
| Fortify (headless routes + actions + features array) | **`@strutvane/auth`**: `features` in `config/auth.ts`, routes registered by the package, actions owned by the app | yes |
| Sanctum (PATs + SPA cookies) | **`@strutvane/auth`** token guard (personal access tokens, abilities) + framework CSRF / origin | yes when the API is on (the `full` and `api` presets) |
| Starter kit (React/Vue/…) pages and settings | **`create-strutvane`** templates (React first) written into the app; a `--teams` variant | yes, with the `full` and `ui` presets |
| Teams kit | **`create-strutvane --teams`** template on top of `@strutvane/auth` tenancy (teams = tenants) | opt-in |
| Socialite | **`@strutvane/social`** | add-on |
| Passport | **`@strutvane/oauth-server`** | add-on |
| WorkOS AuthKit variant | **`@strutvane/sso`** (OIDC/SAML SSO, SCIM; any IdP, WorkOS included) | add-on |
| Jetstream "API tokens page", "browser sessions page" | part of the default settings pages (`settings/api-tokens`, `settings/security` → sessions list) | yes |

Package names follow ADR-0001 (descriptive under `@strutvane`). "socialite" and "passport" are Laravel product names; reusing them would confuse search results and docs. Whether they are protected marks was not checked, so make no legal claim. The docs can say "`@strutvane/social` is Strutvane's Socialite".

### 5.2 `npm create strutvane@latest`: prompts and flags

```
◆ Project name               › acme
◆ Starter kit                › React (Strutvane UI) | None (API only)
◆ Authentication             › Built-in (recommended) | Enterprise SSO (@strutvane/sso) | None
◆ Auth features (multiselect)› ☑ Registration ☑ Email verification ☑ Password reset
                               ☑ Two-factor (TOTP) ☐ Passkeys ☑ Password confirmation ☑ API tokens
◆ Teams?                     › No | Yes
◆ Social sign-in             › ☐ Google ☐ GitHub ☐ Microsoft   (adds @strutvane/social)
◆ Database                   › PostgreSQL | MySQL | SQLite
```

Non-interactive: `npm create strutvane@latest acme -- --react --auth=builtin --features=registration,verification,reset,2fa,confirm,api-tokens --teams --social=google,github --database=postgres`. The kit is generated complete and unpicked features are removed, Laravel's chisel approach (§2.2), so a feature you didn't pick leaves no dead code. `--no-auth` is the same as Laravel's `--no-authentication`.

### 5.3 Session and token model

| Client | Mechanism | Details |
|---|---|---|
| First-party UI (same site) | **Cookie session**, framework store | Cookie `strutvane_session`: `HttpOnly`, `SameSite=Lax`, `Secure` on https. Drivers: `database` (default, `sessions` table), `redis`, `memory` (tests), `cookie` (encrypted, small apps). Session id regenerated on login, on privilege change (team switch, 2FA enable, password change) and on logout (invalidate + new CSRF token) |
| Remember me | long-lived cookie | Laravel parity (`remember_token`), but store a **hash** of the validator (selector:validator), so a database read doesn't hand out cookies. Rotated on use and on logout |
| SPA on another subdomain | the same cookie session | `auth.trustedOrigins` (exists today) is Sanctum's `stateful`; CORS with credentials |
| API clients, CLI, mobile | **Personal access tokens** | `Authorization: Bearer sv_<id>_<secret><crc32>` with a prefix scanners can recognise; SHA-256 of the secret stored; `abilities` (`post.view`, `post.*`, `*`), `expires_at` (**default 1 year**, not Sanctum's "never"), `last_used_at` written at most once a minute. Issued from the `settings/api-tokens` page or the opt-in `POST /api/tokens` (email, password, `device_name`, rate-limited, 2FA-aware) |
| Third-party apps | OAuth2 access tokens | `@strutvane/oauth-server` only |

- **One guard chain**, like `auth:sanctum`: `auth` middleware → session cookie (only when the request passes the origin check) → bearer token → 401 (API) or redirect to `/login` (pages).
- **Token abilities intersect with policies:** effective permission = `policy(user) ∧ token.can(ability)`. For session requests `tokenCan` is `true` (Sanctum semantics), so policy code is the same for UI and API.
- **CSRF** (framework middleware, copying Laravel 13's `PreventRequestForgery`):
  - Unsafe methods on **cookie-authenticated** requests pass if `Sec-Fetch-Site` is `same-origin` (or the `Origin` is the app URL or a trusted origin). Otherwise they need a valid token (`_token` field, `X-CSRF-TOKEN`, or `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie).
  - Bearer requests are exempt: no ambient credential.
  - `originOnly` mode is available. This merges the current `assertSameSite` with Laravel's token fallback, which MVC HTML forms and plain-http development need.
- **No JWT session by default.** Laravel doesn't use one either. JWT stays inside `oauth-server` and `sso`.

### 5.4 Default tables (created by `npx strutvane migrate`, files owned by the app)

Written by `create` as ordinary migrations (TypeScript migration files in whatever format the framework rebuild chooses):

| Migration (Laravel name kept where it exists) | Tables / columns | When |
|---|---|---|
| `0001_01_01_000000_create_users_table` | `users` (`id`, `name`, `email` unique, `email_verified_at`, `password` (nullable for SSO/social-only accounts), `remember_token`, `created_at`, `updated_at`), `password_reset_tokens` (`email` PK, `token` hashed, `created_at`), `sessions` (`id`, `user_id`, `ip_address`, `user_agent`, `payload`, `last_activity`) | always with auth |
| `0001_01_01_000001_create_cache_table` | `cache`, `cache_locks`: the rate limiter's shared store (replaces `strutvane_rate_limits`) | always |
| `0001_01_01_000002_create_jobs_table` | `jobs`, `failed_jobs`: queued auth mail | always |
| `…_add_two_factor_columns_to_users_table` | `two_factor_secret` (encrypted), `two_factor_recovery_codes` (encrypted, 8 codes), `two_factor_confirmed_at` | feature `2fa` |
| `…_create_passkeys_table` | `passkeys` (`user_id`, `name`, `credential_id` unique, `credential` json, `last_used_at`) | feature `passkeys` |
| `…_create_personal_access_tokens_table` | `personal_access_tokens` (`id`, `user_id`, `name`, `token` char(64) unique, `abilities` json, `last_used_at`, `expires_at` indexed, timestamps) | feature `api-tokens` |
| `…_create_user_roles_table` | `user_roles` (`user_id`, `role`), global roles (role *names*, defined in code) | always with auth |
| `…_create_teams_table` (+ `add_current_team_id_to_users`) | `teams` (`name`, `slug` unique, `is_personal`, `deleted_at`), `team_members` (`team_id`, `user_id`, `role`, unique pair), `team_invitations` (`code` unique hashed, `email`, `role`, `invited_by`, `expires_at`, `accepted_at`), `users.current_team_id` | `--teams` |
| `…_enable_team_isolation` (Postgres only) | `ENABLE` + `FORCE` RLS and a RESTRICTIVE policy on every `team_id` table (ADR-0007) | `--teams` on PostgreSQL |
| `…_create_audit_events_table` | `audit_events` | default on (B2B) |
| *(add-on)* `…_create_social_accounts_table` | `social_accounts` (`user_id`, `provider`, `provider_user_id`, unique (`provider`,`provider_user_id`), `email`, `access_token`/`refresh_token` encrypted, `expires_at`) | `@strutvane/social` |
| *(add-on)* `…_create_oauth_tables` | `oauth_clients`, `oauth_auth_codes`, `oauth_access_tokens`, `oauth_refresh_tokens`, `oauth_device_codes` (Passport names) | `@strutvane/oauth-server` |

- **Roles stay in code**, as in Laravel's `TeamRole` enum and today's `config/auth.ts` role map. Only *assignments* are rows: `user_roles` and `team_members.role`. DB-defined custom roles are a later add-on.
- **Add-ons publish their migration** into `database/migrations/` at `npx strutvane install:<x>`, Laravel style. They are then part of the app's normal `migrate` and its history.

### 5.5 `config/auth.ts` (Fortify `features` + Laravel `config/auth.php` + role map)

```ts
import { defineAuthConfig, features } from '@strutvane/auth'
import { env } from '#env'

export default defineAuthConfig({
  home: '/dashboard',
  features: [
    features.registration(),
    features.resetPasswords(),
    features.emailVerification(),
    features.twoFactor({ confirm: true, confirmPassword: true }),
    features.passwordConfirmation({ timeoutSeconds: 10_800 }),
    features.apiTokens({ abilities: ['*.view', '*.create', '*.update', '*.delete'], defaultExpiryDays: 365 }),
  ],
  passwords: { min: 12, uncompromised: false, resetExpiryMinutes: 60, resetThrottleSeconds: 60 },
  roles: {
    admin:  { permissions: ['*'] },
    member: { permissions: ['*.viewAny', '*.view', '*.create', { action: '*.update', own: true }] },
    viewer: { permissions: ['*.viewAny', '*.view'] },
  },
  team: { roles: { owner: ['*'], admin: ['team.update', 'invitation.*'], member: [] } }, // --teams only
  wildcardExclude: ['user', 'session', 'personalAccessToken', 'auditEvent'],
  trustedOrigins: [],
  trustedProxies: [],
})
```

`config/session.ts` (`driver`, `lifetimeMinutes`, `cookie`, `secure`, `sameSite`), `config/hashing.ts` (`driver: 'argon2id'`, `rehashOnLogin: true`) and `config/services.ts` (social credentials) mirror their Laravel files.

### 5.6 Policies and gates in TypeScript

**Auto-discovery:** `app/models/invoice.model.ts` ↔ `app/policies/invoice.policy.ts` (default export), matched by file name at build time through the static registry (ADR-0010, oxc). There is no runtime scanning and no reflection. Override with `defineModel('invoice', { policy: SomeOtherPolicy })`, the equivalent of `#[UsePolicy]`. A model without a policy gets only the role-map grants (deny by default), matching Laravel's "no policy → false".

**Generator:** `npx strutvane make:policy InvoicePolicy --model=Invoice` writes:

```ts
// app/policies/invoice.policy.ts
import { Policy } from '@strutvane/auth'
import { Invoice } from '#models/invoice.model'

export default class InvoicePolicy extends Policy(Invoice) {
  /** Runs first; `true`/`false` decides, `undefined` falls through (Laravel's `before`). */
  before({ user }) {
    return user.hasRole('admin') ? true : undefined
  }

  viewAny({ user }) { return user.hasVerifiedEmail() }

  /** Returns a row predicate: checked in memory for one record, compiled to SQL WHERE for lists. */
  view({ user, row }) { return row.ownerId.eq(user.id).or(row.status.eq('published')) }

  create({ user }) { return user.hasRole('member') }

  update({ user, row }) { return row.ownerId.eq(user.id).and(row.status.ne('paid')) }

  delete({ user, row }) { return this.deny('paid-is-final', row.status.eq('paid')) } // deny wins

  approve({ user, row }) { return user.hasRole('manager') ? row.amount.lte(10_000) : false }

  fields = {
    internalNotes: { read: ['manager'], write: ['manager'] }, // field rules (exist today)
  }
}
```

- **Return type:** a method returns `boolean | Predicate | Response`. Booleans are decided on actor data. Predicates over `row` compile through the existing typed builder (`row.amout` and `row.amount.eq('x')` are compile errors).
- **The class is sugar over today's `definePolicy` IR**, so ADR-0008's NULL-safe two-valued semantics, deny-wins and `explain()` stay unchanged.
- **Responses:** `this.allow()`, `this.deny(code)` and `this.denyAsNotFound()` (Laravel's `Response`) map to RFC 9457 problems with catalog messages (RFC-0003).
- **Pitfall (security, must ship with the feature):** `predA && predB` in JavaScript returns `predB`, which silently drops a condition. Policies must combine predicates with `.and()` / `.or()` / `all()` / `any()`. Enforce it with a type-aware lint rule, so the boot check and CI reject logical operators on predicate-typed operands (typescript-eslint's `strict-boolean-expressions` catches object operands; whether Biome has an equivalent is *unverified*). Also add a property test that policy files can't mix them.
- **Lists need a compilable `view`:** a list endpoint (`index`) requires `view` to return a predicate (or a boolean). If `view` is opaque (calls a service, for example), boot fails for any model that has a list route, telling the developer to add a predicate. Fail closed: never "load everything and filter in memory".

**Gates** (non-model abilities, Laravel's `Gate::define`):

```ts
// app/providers/app.provider.ts
gate.define('viewAdminDashboard', ({ user }) => user.hasRole('admin'))
```

**Using them** (same verbs as Laravel):

```ts
// controller
await authorize('update', invoice)                     // throws → 403 problem
if (await user.cannot('create', Invoice)) { … }
const rows = await Invoice.query().authorized(user, 'view').paginate() // SQL filter, counts stay correct
// routes/web.ts
route.put('/invoices/:invoice', [InvoiceController, 'update']).middleware('auth').can('update', 'invoice')
route.resource('invoices', InvoiceController).middleware(['auth', 'verified']) // index/show/store/update/destroy auto-authorized by policy method
```

**In the UI:** controllers share `auth.user` and per-record `can` maps (the Inertia-share pattern), and the kit ships `<Can do="update" on={invoice}>`. These are hints only; the server always decides.

**Roles:** the role map is a generalised `Gate::before`: `allowed = (policy allows OR role grants) AND NOT policy denies`. That is unchanged from today.

### 5.7 Routes registered by `@strutvane/auth` (Fortify parity)

| Method | Path | Feature | Notes |
|---|---|---|---|
| GET/POST | `/login` | core | form → redirect to `home`; XHR → JSON (`{ twoFactor: true }` when needed) |
| POST | `/logout` | core | invalidate + regenerate |
| GET/POST | `/register` | registration | runs `app/actions/auth/create-new-user.ts` |
| GET/POST | `/forgot-password` | reset | constant time, no enumeration (kept) |
| GET | `/reset-password/:token` · POST `/reset-password` | reset | revokes all sessions and tokens (kept) |
| GET | `/email/verify` · GET `/email/verify/:id/:hash` (signed) · POST `/email/verification-notification` (6/min) | verification | |
| GET/POST | `/user/confirm-password` | confirmation | |
| GET/POST | `/two-factor-challenge` | 2fa | 5/min per pending login |
| POST/DELETE | `/user/two-factor-authentication`, POST `/user/confirmed-two-factor-authentication`, GET `/user/two-factor-qr-code`, GET/POST `/user/two-factor-recovery-codes` | 2fa | `password.confirm` |
| PUT | `/user/profile-information`, `/user/password` | core | actions owned by the app |
| GET/POST/DELETE | `/user/api-tokens` | api-tokens | |
| GET/DELETE | `/user/sessions` (`logoutOtherDevices`) | core | Jetstream's "browser sessions" |
| POST | `/teams`, `/teams/:team/switch`, `/teams/:team/members`, `/teams/:team/invitations` … | teams | the `team_members` API (exists today) |

All paths can be renamed (Fortify `paths.*`) and moved under a prefix.

### 5.8 Generated app (owned files)

```
app/
  models/user.model.ts                  ← defineModel('user', { fields, auth: { verifyEmail: true, twoFactor: true, apiTokens: true } })
  policies/                              ← make:policy output, auto-discovered
  actions/auth/create-new-user.ts  reset-user-password.ts  update-user-profile.ts  update-user-password.ts  password-rules.ts
  controllers/settings/profile.controller.ts  security.controller.ts  api-tokens.controller.ts
  controllers/teams/*.controller.ts     ← --teams
  middleware/share-auth.ts              ← Inertia-like shared props (auth.user, can maps)
  providers/app.provider.ts             ← gates
  providers/auth.provider.ts            ← views, rate limiters, actions (FortifyServiceProvider)
  mail/auth/verify-email.tsx  reset-password.tsx  team-invitation.tsx
config/auth.ts  session.ts  hashing.ts  services.ts
database/migrations/0001_01_01_000000_create_users_table.ts …
database/seeders/database.seeder.ts      ← admin from env (replaces seedAdmin-at-boot)
routes/web.ts  routes/api.ts  routes/settings.ts
resources/js/pages/auth/{login,register,forgot-password,reset-password,verify-email,confirm-password,two-factor-challenge}.tsx
resources/js/pages/settings/{profile,security,api-tokens,appearance}.tsx
resources/js/pages/teams/{index,edit}.tsx   ← --teams
resources/js/pages/dashboard.tsx  welcome.tsx
tests/feature/auth/*.test.ts            ← sign-in, lockout, reset, verify, 2FA, tokens, policy, team isolation
```

Folder names (`resources/js` vs `web/`) belong to the UI and framework rebuild research. The *roles* of the files are the point.

### 5.9 Add-ons

**`@strutvane/social`** (Socialite, plus the parts Socialite leaves to you):
- Install: `npm i @strutvane/social && npx strutvane install:social --providers=google,github,microsoft`. This adds `config/services.ts` entries, `.env` / `.env.example` keys (`GOOGLE_CLIENT_ID=` …), the `social_accounts` migration, routes `GET /auth/:provider/redirect` and `/auth/:provider/callback`, and buttons on the login and register pages.
- Low-level API for parity: `social.driver('github').scopes([...]).redirect()`, `.user()`, `.stateless()`, `social.fake()` for tests.
- **Safe defaults Socialite doesn't give you:**
  - state, PKCE and OIDC nonce always on
  - auto-link to an existing account only when the provider asserts `email_verified` *and* the provider is trusted for that email domain; otherwise ask the user to sign in and link
  - provider tokens encrypted at rest
  - registration still governed by `features.registration()`
- **Engine:** `arctic` 3.7.0 covers many providers but has had no release since 2025-05-21 (maintenance risk; re-check). Alternative: Better Auth's provider set (Google, GitHub, Microsoft Entra ID, Apple, Discord, LinkedIn, … per better-auth.com, 2026-11-14) behind the adapter. The choice needs a short spike.

**`@strutvane/oauth-server`** (Passport):
- Install: `npx strutvane install:oauth-server`. This adds the `oauth_*` migrations, keys in the env (never committed), a consent page, `config/oauth.ts` with `scopes` (Passport `tokensCan`), and the `oauth:client` / `oauth:purge` commands.
- Grants: authorization code + PKCE, client credentials, device code, refresh. Password and implicit are **not offered** (Laravel discourages them; OAuth 2.1 drops them).
- Engine candidates: `oidc-provider` 9.15.0 (mature, standards-focused) or `@jmondi/oauth2-server` 5.0.0 (closer to League/Passport). This is also the natural home for MCP/agent authorization in 2026.

**`@strutvane/sso`** (the WorkOS variant, vendor-neutral): OIDC and SAML connections per team, SCIM provisioning, `create` prompt "Enterprise SSO". The existing spec's §1.1 decisions (Better Auth SSO/SCIM behind `ProvisioningProvider`) can live here.

### 5.10 Commands (npm only)

| Laravel | Strutvane |
|---|---|
| `laravel new app` | `npm create strutvane@latest app` |
| `php artisan migrate` | `npx strutvane migrate` |
| `php artisan make:policy PostPolicy --model=Post` | `npx strutvane make:policy PostPolicy --model=Post` |
| `php artisan make:model Post -a` | `npx strutvane make:model Post --all` (model, migration, policy, controller, pages) |
| `php artisan install:api` | `npx strutvane install:api` (when the app was created without API tokens) |
| `composer require laravel/socialite` | `npm i @strutvane/social && npx strutvane install:social` |
| `install:api --passport`, `passport:client`, `passport:purge` | `npx strutvane install:oauth-server`, `oauth:client`, `oauth:purge` |
| `sanctum:prune-expired --hours=24` | `npx strutvane tokens:prune --hours=24` |
| `auth:clear-resets` | `npx strutvane auth:clear-resets` |
| `route:list` | `npx strutvane route:list` (shows middleware and the policy per route) |
| tinker / seeder | `npx strutvane user:create --email … --role admin --password-env ADMIN_PASSWORD`, `team:create`, `team:member:add`, `db:seed` |
| — | `npx strutvane doctor` (tenancy RLS audit, relation-key audit, policy lint, missing compilable `view` rules) |

---

## 6. Developer flow: from zero to protected CRUD with roles

```bash
npm create strutvane@latest acme -- --react --teams --features=registration,verification,reset,2fa,confirm,api-tokens --database=postgres
cd acme                        # .env written from .env.example with a fresh APP_KEY; DATABASE_URL asked or defaulted
npx strutvane migrate          # users, password_reset_tokens, sessions, cache, jobs, 2FA columns, PATs, user_roles, teams…, RLS
npm run dev                    # http://localhost:3000 → /register, /login, /forgot-password, settings, teams all work
```

1. **First admin:** `ADMIN_PASSWORD=… npx strutvane user:create --email ada@acme.test --name Ada --role admin`, or register in the browser. Registration creates a personal team where the user is `owner`.
2. **A model with CRUD:** `npx strutvane make:model Invoice --all` writes `app/models/invoice.model.ts` (fields + `team` scoping), the migration (auto-diffed), `app/policies/invoice.policy.ts`, `InvoiceController`, pages and `route.resource('invoices', …)` inside `auth` + `verified`. Then `npx strutvane migrate`. With teams on Postgres, the new table also gets the RESTRICTIVE RLS policy.
3. **Rules:** edit the role map in `config/auth.ts` (who may do what in general) and `invoice.policy.ts` (record rules such as "only the owner may update, paid is final"). Lists are filtered in SQL by `view`; show, update and delete are checked per record. Fields such as `internalNotes` are hidden or refused per role.
4. **Team roles:** invite `vic@acme.test` as `member` from `teams/edit`, or run `npx strutvane team:member:add --team acme --email vic@acme.test --role member`. Vic sees only Acme's invoices (application filter + RLS) and can update only his own.
5. **API:** Vic creates a token on `settings/api-tokens` with `invoice.view`. `curl -H "Authorization: Bearer sv_…" /api/invoices` returns his team's invoices; `POST` gets 403 because the ability is missing, even though his role allows create.
6. **Social sign-in later:** `npm i @strutvane/social && npx strutvane install:social --providers=google` → fill `GOOGLE_CLIENT_ID/SECRET` → `npx strutvane migrate` → a "Continue with Google" button appears.
7. **Tests:** `actingAs(user, { abilities: ['invoice.view'] })` (Sanctum's `actingAs`) in `tests/feature`, plus the generated auth suite.

---

## 7. Reuse analysis of `packages/auth` (0.1.0-next.0)

### 7.1 Keep, adapt or retire

| Module (today) | Verdict | Why / what changes |
|---|---|---|
| `policy/` (`schema`, `filter`, `bind`, `validate`, `evaluate`, `builder`, `policy`, `provider`) | **Keep** (core asset) | The typed predicate builder, in-memory ≡ SQL (property-tested on PGlite), deny-wins, ADR-0008/0017 null semantics and `explain()` have no Laravel equivalent. **Adapt:** add the `Policy(Model)` class surface (§5.6), `before`, Laravel-style `Response` helpers, auto-discovery by file name, and schema taken straight from `defineModel` |
| `policy/roles.ts` (`compileRoleMap`) | **Keep** | The role map *is* Laravel's `Gate::before` plus the teams kit's `TeamRole::permissions()`, made declarative and SQL-aware (`own: true`). Add a `team.roles` block for team-scoped roles |
| `field-rules.ts` | **Keep** | Per-role readable/writable fields on serialize and write. Laravel has only static `$hidden` |
| `sql/compile.ts` | **Keep** | Backs `Model.query().authorized(user, action)` |
| `postgres/rls.ts`, `with-tenant.ts`, `lint.ts` (`findSessionSet`), `audit-query.ts` (`tenancyAudit`), `relation-keys.ts` | **Keep, opt-in** | Becomes "strict team isolation" for `--teams` on PostgreSQL, run by `npx strutvane doctor`. MySQL/SQLite get the application filter only (document this) |
| `postgres/rate-limit-store.ts` | **Adapt** | Back it with the framework cache store (`cache` table / Redis), Laravel's model; retire `strutvane_rate_limits` |
| `identity/rate-limit.ts`, `limiter.ts` | **Keep** | Separate per-IP (IPv6 /64) and per-account limits beat Laravel's single `email|ip` key, which lets an attacker who rotates IPs keep guessing one account. Expose it as `rateLimiter.for('login', …)` in `auth.provider.ts`. Defaults today: sign-in 10/60 s per IP and 20/900 s per account; sign-up 10/h per IP; reset 5/900 s |
| `http/client-ip.ts`, `request-meta.ts` | **Keep** (move to the framework if it owns requests) | Socket peer + `trustedProxies` is Laravel's TrustProxies done safely |
| `middleware/core.ts`, `hono.ts`, `node.ts` | **Adapt** | Become the framework middleware aliases `auth`, `guest`, `verified`, `can`, `password.confirm`, `abilities`, `ability`, `throttle` |
| `provider.ts` endpoints (`POST /auth/sign-in`… under the API base path, JSON only) | **Adapt** | Fortify-parity routes (§5.7) that answer a redirect to forms and JSON to XHR. **Keep:** cross-site refusal, the 16 KiB streamed body cap, RFC 9457 problems, session rotation on tenant create or switch, the members API with the last-owner guard. **Change:** accept `application/x-www-form-urlencoded` *with* the CSRF token (§5.3); today it requires `application/json` to defeat form CSRF |
| `identity/engine.ts` (`IdentityEngine`, result types, never throws) | **Keep** | Internal seam; `add-ons` and `sso` plug in here |
| `identity/native.ts` (in-memory engine) | **Adapt → default** | Make it persistent on the app's own `users`/`sessions`/`password_reset_tokens` via the ORM, built from the primitives docs/07 §1.1 already names: argon2id (`@node-rs/argon2`), TOTP (`otpauth` or `@oslojs/otp`), WebAuthn (`@simplewebauthn/server`). Add bcrypt verify (`@node-rs/bcrypt`) plus rehash-on-login for imported Laravel users |
| `identity/better-auth.ts`, `identity/app-identity.ts` (engine selection), `migrations/postgres/*_strutvane_auth_identity.sql` (camelCase `user`/`account`/`session`/`organization`/`member`/`invitation`) | **Retire from the default** (or keep as an optional adapter) | A second session concept and non-Laravel table names. The pinned semi-internal `$context.adapter` and the tripwire suite are an upkeep cost. Supersedes ADR-0005/0013 (§9). It could survive inside `@strutvane/sso` |
| `testing/contract.ts`, `helpers.ts` | **Keep** | Run the contract against the persistent native engine; add `actingAs` |
| `audit/audit.ts` | **Keep** | Subscribe to auth events (`Registered`, `Login`, `Failed`, `Lockout`, `PasswordReset`, `Verified`, `Logout`, Laravel's list) |
| `admin.ts` (`openIdentityAdmin`: `ensureUser`/`ensureTenant`/`setMember`) | **Adapt** | Seeders use the `User` / `Team` models directly (Laravel style); keep idempotent `ensure*` helpers |
| `commands.ts` | **Adapt** | **Retire** `auth:migration` (migrations are app files now). Rename `auth:user:create` → `user:create`, `tenant:create` → `team:create`, `tenant:member:add` → `team:member:add`. Keep the `--password-env` rule (never a password flag). **Add** `tokens:prune`, `auth:clear-resets`, `make:policy` |
| `config.ts` (`defineAuthConfig`, unknown keys are compile errors) | **Keep the pattern** | Reshape to §5.5 (`features`, `passwords`, `home`, `team`). `registration` becomes the presence of `features.registration()`: still off unless listed |
| `tenancy/resolver.ts` | **Keep** | Default for teams: path resolver (`/:team/…`, as in the Laravel teams kit) + session `current_team_id`; subdomain optional. Anonymous requests never get a team (kept) |
| `errors.ts` | **Keep** | Stable problem codes |
| `seedAdmin` created at boot | **Retire** | Boot-time writes surprise people; use `user:create` / the seeder (Laravel has no boot seeding) |
| "No `User` model" stance (commit `dee09d9`, docs/07 §2.2) | **Retire** | Laravel's flow depends on an owned `User` model (edit `CreateNewUser` to add `phone`) |

### 7.2 Concepts that rename but stay the same

tenant → **team**, membership → **team member**, `owner/admin/member/viewer` → team roles `owner/admin/member` (+ `viewer` kept as an extra), `POST /auth/switch-tenant` → `POST /teams/:team/switch` (still rotates the session), `X-Tenant-Id` for service actors → unchanged.

### 7.3 Hardening to carry over (the non-regression list)

Each item is stricter than or equal to Laravel's default and already tested here (`test/vapt.test.ts`, `test/security-regressions.test.ts`):

1. Per-account login limit independent of IP. A forged `X-Forwarded-For` is ignored unless it comes from a trusted proxy. A missing peer address shares one fallback bucket.
2. New session on sign-in. Rotation on privilege change. Revocation of **all** sessions, tokens and outstanding reset links on password reset.
3. Constant-time reset start (no user enumeration).
4. Minimum password length 12 (Laravel defaults to 8).
5. Origin / `Sec-Fetch-Site` refusal of cross-site state changes, plus Laravel 13's token fallback.
6. Body size cap.
7. Deny-by-default policies; NULL-safe two-valued semantics; `role: []` is an error, never "everyone".
8. RESTRICTIVE RLS + `tenancyAudit` for team data on Postgres.
9. Audit redaction of secrets.
10. *(New)* PAT expiry defaults to 1 year (Sanctum: never). Remember-me validator stored hashed. Social auto-linking only on a verified, trusted email. TOTP secrets and recovery codes encrypted.

---

## 8. Concrete proposal (decision-ready list)

1. **Packages.**
   - Default: `@strutvane/framework` (session, CSRF, hashing, signed URLs, cache rate limiter, mail) and `@strutvane/auth` (guard, features and routes, personal access tokens, policies, role map, field rules, teams/tenancy, audit).
   - Add-ons: `@strutvane/social`, `@strutvane/oauth-server`, `@strutvane/sso`.
   - Starter templates live in `create-strutvane` (`react`, `react --teams`; Vue and Svelte later).
2. **Commands:** `npm create strutvane@latest`, `npx strutvane migrate | make:policy | make:model --all | install:api | install:social | install:oauth-server | user:create | team:create | team:member:add | tokens:prune | auth:clear-resets | route:list | doctor`.
3. **App layout:** §5.8. Owned pages, actions, settings controllers, policies, `User` model and migrations.
4. **Default tables:** `users`, `password_reset_tokens`, `sessions`, `cache`, `cache_locks`, `jobs`, `failed_jobs`, `user_roles`, `audit_events`, plus per feature: 2FA columns, `passkeys`, `personal_access_tokens`, `teams`, `team_members`, `team_invitations`, `users.current_team_id`, RLS on Postgres. Add-ons: `social_accounts`, `oauth_*`.
5. **Session/token model:** one framework cookie session for the UI (database driver default); personal access tokens with abilities for APIs; OAuth2 only through the add-on. One `auth` middleware tries the session (origin-checked), then the bearer token.
6. **Authorization:** per-model policy classes in `app/policies`, auto-discovered by file name, compiled to SQL for lists; gates in `app.provider.ts`; the role map in `config/auth.ts`; `authorize()`, `user.can()`, `.can()` on routes, auto-authorized resource routes, `<Can>` in the UI.
7. **Flow:** §6.

---

## 9. Conflicts with current decisions (need ADRs before building; reported, not silently resolved)

| # | Current decision | This proposal | Action |
|---|---|---|---|
| C1 | pnpm via corepack everywhere; app alias `pnpm sv` (ECOSYSTEM §6, CLAUDE.md) | npm only, `npx strutvane …` | ADR on package manager / CLI invocation; update D-rules and the integration docs |
| C2 | `@strutvane/auth` depends only on `core`/`contracts`; "product packages never import each other"; policies talk to the framework only through `PermissionProvider` (ADR/integration map) | MVC monolith: `Model.query().authorized()`, resource-route auto-authorization and an owned `User` model couple auth and framework tightly. Either (a) keep the contract seam and add hooks for these, or (b) move guard + Gate + policies into the framework (Laravel's layout) and leave `@strutvane/auth` with features, tokens and teams | ADR on the monolith package boundaries; recommend deciding together with the framework rebuild |
| C3 | ADR-0005 / ADR-0013: Better Auth is the default engine, hardened adapter | persistent native engine on app tables by default; Better Auth optional or confined to `sso` | ADR superseding 0005/0013. Security review of the native engine (threat model first, the identity contract suite as the gate) |
| C4 | docs/07 §2.2 and commit `dee09d9`: no `User` model generated; identity lives in the auth store | owned `app/models/user.model.ts` | ADR + docs/07 rewrite |
| C5 | Package migrations applied from `node_modules` by `sv migrate` (docs/06 §3.4, docs/17 §6.1); `auth:migration` kept | migrations published into `database/migrations/` at create/install time; `auth:migration` retired | ADR on migration ownership; keep package migrations only if the framework research wants them |
| C6 | Public sign-up off unless `registration: true`; `seedAdmin` created at boot | registration is a listed feature (default *on* in the create prompt, off if unlisted); admin via seeder or `user:create` | Product call: B2B default for the prompt (on = Laravel parity; off = current stance) |
| C7 | docs/07 §2.1 `sv add auth` installer prompts (methods, MFA policy, tenancy strategies, JWT sessions) | auth chosen at `create`; `install:*` for add-ons; no JWT sessions | Fold into the create-strutvane spec |
| C8 | ADR-0001 descriptive names | `social`, `oauth-server`, `sso` (consistent); rejecting `socialite`/`passport` | none, if accepted |

**Open questions for the owner:**
- The view layer (an Inertia-like server-driven React vs today's manifest-driven `@strutvane/ui`, ADR-0014) decides how the auth pages receive props. That belongs to the UI research.
- `arctic` vs Better Auth providers for `@strutvane/social`: needs a spike.
- `oidc-provider` vs `@jmondi/oauth2-server`: needs a spike.
- Whether `viewer` stays a default role.
- Whether teams should be on by default for the B2B `full` preset.
