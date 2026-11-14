// The project's command line, like Laravel's `artisan`. Run it from this folder:
//
//   node strut                     list every command
//   node strut route:list          show the routes
//   node strut help make:controller
//
// It is a plain .js file so `node strut` works the same in PowerShell, cmd and bash.
import { runConsole } from '#strutvane/console'
import app from './bootstrap/app.ts'

process.exitCode = await runConsole(app, process.argv.slice(2))
