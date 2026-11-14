import { ResourceController } from '#strutvane/http'
import { Author } from '../../models/author.ts'
import { AuthorPolicy } from '../../policies/author.policy.ts'

/** Author profiles. Validation comes from the metadata, narrowed by `Author.fillable`. */
export class AuthorController extends ResourceController<typeof Author> {
  protected readonly model = Author
  protected readonly policy = new AuthorPolicy()
}
