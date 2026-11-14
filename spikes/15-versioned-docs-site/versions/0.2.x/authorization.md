---
title: Authorization
description: Decide who may do what with policies. Everything is denied unless a policy allows it, invisible records answer 404 instead of 403, admins pass through before(), and developers get an explanation of every denial in local mode.
---

**Authentication** answers "who are you?". **Authorization** answers "are you allowed to do this?": may Bob edit Alice's post? May a guest see a draft?

In Strutvane, those answers live in **policies**: one class per model in `app/policies/`, with one method per action. And the most important rule: **anything a policy doesn't explicitly allow is denied.**

:::tip[Coming from Laravel?]
Policies work like Laravel's: `viewAny`, `view`, `create`, `update`, `delete`, plus `before()` for admins, and `authorize()` instead of `$this->authorize()`.

Two safer defaults: a **missing method denies** (in some Laravel tools a missing method allows), and a record the user may not `view` answers **404, not 403**, from show, update, delete and custom actions (Laravel's `denyAsNotFound`, always on), so hidden records can't be discovered by guessing URLs.
:::

## The smallest example

```ts title="app/policies/post.policy.ts"
import type { AuthUser, Policy } from '@strutvane/framework'
import type { Post } from '../models/post.ts'

export class PostPolicy implements Policy<Post> {
  /** Anyone may list posts. */
  viewAny(): boolean {
    return true
  }

  /** Published posts are public; drafts only for their author. */
  view(user: AuthUser | null, post: Post): boolean {
    return post.status === 'published' || user?.id === post.author_id
  }
}
```

Give it to the controller:

```ts title="app/http/controllers/post.controller.ts"
export class PostController extends ResourceController<typeof Post> {
  protected readonly model = Post
  protected readonly policy = new PostPolicy()
}
```

What you'll see:

| Request | Result | Why |
|---|---|---|
| `GET /api/posts/hello-world` (published), as a guest | `200` | `view` allows published posts |
| `GET /api/posts/alice-draft`, as a guest | `404` | `view` says no, so it looks missing |
| `POST /api/posts`, as Alice | `403` | There's no `create` method, so it's denied |

## The policy methods

| Method | Called for | Arguments |
|---|---|---|
| `viewAny(user)` | Listing (`index`) | the user (or `null`) |
| `view(user, record)` | Showing one record, and before any update/delete | the user, the record |
| `create(user)` | `store` | the user |
| `update(user, record)` | `update` and custom actions you guard with it | the user, the record |
| `delete(user, record)` | `destroy` | the user, the record |
| `before(user, ability)` | **First**, before any of the above | the user, the action name |

Each method returns `true` or `false` (or a `Promise` of one). Anything other than `true` means **no**.

`user` is `null` for guests, so write `user?.id` and decide what guests may do.

### A complete policy (typical)

```ts title="app/policies/post.policy.ts"
import type { AuthUser, Policy } from '@strutvane/framework'
import type { Post } from '../models/post.ts'

/**
 * Who may do what with posts. A method that is missing denies, so `delete` below is
 * admin-only through `before()`.
 */
export class PostPolicy implements Policy<Post> {
  /** Admins may do everything; for everyone else, fall through to the methods below. */
  before(user: AuthUser | null): boolean | undefined {
    return user?.is_admin === true ? true : undefined
  }

  /** Anyone may list posts (the controller narrows the list to what they may see). */
  viewAny(): boolean {
    return true
  }

  /** Published posts are public; drafts only for their author. */
  view(user: AuthUser | null, post: Post): boolean {
    return post.status === 'published' || user?.id === post.author_id
  }

  /** Any signed-in author may write. */
  create(user: AuthUser | null): boolean {
    return user !== null
  }

  /** Only the author may edit. */
  update(user: AuthUser | null, post: Post): boolean {
    return user?.id === post.author_id
  }
}
```

### `before()`: let admins through

`before()` runs first. Return:

- `true`: allowed, skip the other methods;
- `false`: denied, skip the other methods;
- `undefined`: no opinion, carry on to the normal method.

A helper, `hasAdminRole(user)`, is `true` for a user with `is_admin: true` or `'admin'` in a `roles` list. Generated policies use it.

## Checking a policy yourself: `authorize()`

`ResourceController` checks the policy in every action. In your own actions, call `authorize()`:

```ts
import { authorize } from '@strutvane/framework'

await authorize(this.policy, 'update', ctx.user, post, 'post')   // throws 403 if not allowed
```

| Argument | Meaning |
|---|---|
| `this.policy` | The policy to ask |
| `'update'` | The action: `viewAny`, `view`, `create`, `update` or `delete` |
| `ctx.user` | Who's asking (`null` for guests) |
| `post` | The record (`undefined` for `viewAny` and `create`) |
| `'post'` | A label for the message: "You are not allowed to update this post." |

When you only need a yes/no answer (to show or hide a button), use `allows()`:

```ts
import { allows } from '@strutvane/framework'

const canEdit = await allows(this.policy, 'update', ctx.user, post)   // true or false
return ctx.json({ data: post, meta: { canEdit } })
```

## 403 or 404?

Imagine Bob tries `PATCH /api/posts/alice-draft`. If he got `403 Forbidden`, he'd learn that a draft called `alice-draft` exists. So Strutvane checks `view` **first**, in every action that targets one record:

| Bob may `view` it? | Bob may `update` it? | Bob gets |
|---|---|---|
| No | (not asked) | `404` `No post matches "alice-draft".` (same as a missing post) |
| Yes | No | `403` `You are not allowed to update this post.` (honest) |
| Yes | Yes | `200` |

In your own actions, do the same with `visible()`:

```ts title="app/http/controllers/post.controller.ts"
async publish(ctx: HttpContext): Promise<Response> {
  const post = await this.visible(ctx)                               // 404 if they can't see it
  await authorize(this.policy, 'update', ctx.user, post, 'post')    // 403 if they can't change it
  post.fill({ status: 'published' })
  await post.save()
  return ctx.json({ data: post })
}
```

## Lists: what may each user see?

`viewAny` answers "may this user list posts at all?". It doesn't filter **which** posts. Narrow the list in the controller with `indexConstraints()`:

```ts title="app/http/controllers/post.controller.ts"
protected override indexConstraints(ctx: HttpContext): Constraint[] {
  if (ctx.user?.is_admin === true) return []
  const visible: Constraint[] = [{ column: 'status', equals: 'published' }]
  if (ctx.user !== null) visible.push({ column: 'author_id', equals: ctx.user.id })
  return [{ anyOf: visible }]
}
```

What you'll see for `GET /api/posts`: guests get the published posts; Alice also gets her drafts; admins get everything. Totals and pages match.

:::caution[Coming in 0.2]
Writing the same rule twice (in `view()` and in `indexConstraints()`) is temporary. In 0.2, a policy method may return a **row condition** that checks one record *and* filters lists in SQL, compiled from the policy (proven in spike 02).
:::

## Developers see why: hints in local mode

In local debug mode (`APP_DEBUG=true`, `APP_ENV=local` or `testing`), every `403` explains itself:

```json
{
  "status": 403,
  "code": "forbidden",
  "detail": "You are not allowed to delete this post.",
  "hint": "PostPolicy has no delete() method, so this is denied (Strutvane denies by default). Add delete(user, post) to the policy to allow it."
}
```

When the method exists and said no:

```json
{ "detail": "You are not allowed to update this post.", "hint": "PostPolicy.update() returned false for this user." }
```

In production the `hint` is never sent.

## Generated policies deny everything

`node strut make:controller PostController --api` (or `--resource`, or `--model=Post`) writes `app/policies/post.policy.ts` if it doesn't exist:

```ts title="app/policies/post.policy.ts"
import { hasAdminRole, type AuthUser, type Policy } from '@strutvane/framework'
import type { Post } from '../models/post.ts'

/**
 * Who may do what with posts. Generated to deny everyone except admins: open up each
 * method deliberately. A method you delete also denies.
 */
export class PostPolicy implements Policy<Post> {
  /** Admins may do everything. */
  before(user: AuthUser | null): boolean | undefined {
    return hasAdminRole(user) ? true : undefined
  }

  /** TODO: who may list posts? */
  viewAny(_user: AuthUser | null): boolean {
    return false
  }

  /** TODO: who may see one post? */
  view(_user: AuthUser | null, _post: Post): boolean {
    return false
  }

  /** TODO: who may create a post? */
  create(_user: AuthUser | null): boolean {
    return false
  }

  /** TODO: who may change this post? */
  update(_user: AuthUser | null, _post: Post): boolean {
    return false
  }

  /** TODO: who may delete this post? */
  delete(_user: AuthUser | null, _post: Post): boolean {
    return false
  }
}
```

**Why so strict?** A new endpoint should never be open by accident. You open each action deliberately, one method at a time.

And a resource controller **without** a policy doesn't start at all (see Common mistakes).

## Common mistakes

### Everyone gets 403 on create

```json
{ "status": 403, "code": "forbidden", "detail": "You are not allowed to create a post.", "hint": "PostPolicy has no create() method, so this is denied (Strutvane denies by default). Add create(user) to the policy to allow it." }
```

**Fix:** add the method:

```ts
create(user: AuthUser | null): boolean {
  return user !== null
}
```

### "… serves resource routes but has no policy"

```text
✖ PostController serves resource routes but has no policy.
→ Give it a `protected readonly policy = new PostPolicy()` and call authorize() in every action (node strut make:controller --resource writes this for you).
```

### My update returns 404 for a post that exists

**Why:** `view()` returns `false` for this user, so the post is treated as invisible.

**Fix:** decide whether they should see it. If yes, allow it in `view()`; then `update()` decides about changing it.

### My policy returns a truthy value but is still denied

**Why:** only exactly `true` allows. `1`, `'yes'` or an object count as "no".

**Fix:** return a real boolean: `return user?.id === post.author_id`.

## Next steps

- [Controllers](../controllers/): `visible()`, `indexConstraints()` and custom actions.
- [Middleware](../middleware/): `auth`, and route-wide checks like `admin`.
- [Teams & Tenancy](../tenancy/): keeping each customer's data apart.
