# Packaging audit replay (Git Bash). S = this scratch dir, P = hub packages/.
# Report-only: everything runs on throw-away clones under $S.
P=/c/personal_projects/strutvane/packages
S=$(cd "$(dirname "$0")/.." && pwd)
cd "$S"

# 1. Clones at the audited refs
mkdir -p clones && cd clones
git clone -q --branch v2/consolidate "$P/framework" framework
for d in auth ui logs create-strutvane files; do git clone -q --branch main "$P/$d" "$d"; done
(cd framework && npm ci --ignore-scripts && npm rebuild esbuild && npx tsdown)
for d in auth ui logs files create-strutvane; do (cd $d && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm@12.18.0 install --frozen-lockfile && corepack pnpm@12.18.0 exec tsdown); done
cd ..

# 2. Pack + inspect + publint + attw (ESM-only profile; node16 profile only adds the expected CJS warning)
mkdir -p tarballs
for d in framework auth ui logs files create-strutvane; do (cd clones/$d && npm pack --ignore-scripts --pack-destination ../../tarballs); done
for t in tarballs/*.tgz; do
  node packaging-patches/tools/inspect-tarball.mjs "$t"
  npx -y publint@0.3.25 run "$t" --strict
  npx -y @arethetypeswrong/cli@0.18.5 "$t" --profile esm-only
done

# 3. Two kernels, as published today (expect exit 1: tokens differ, NotFoundError -> 500)
mkdir -p apps/asis && cd apps/asis && printf '{"name":"asis-app","private":true,"type":"module"}\n' > package.json
npm install --ignore-scripts ../../tarballs/strutvane-{framework,auth,ui,logs,files}-0.1.0-next.0.tgz
npm ls --all | grep @strutvane            # framework + @strutvane/core + @strutvane/contracts
node two-kernels.mjs                       # {"loggerTokenSame":false,"notFoundIsFrameworkError":false,"problemStatus":500}
cp ../../packaging-patches/tools/import-all.mjs .import-all.mjs && node .import-all.mjs @strutvane/framework @strutvane/auth @strutvane/logs @strutvane/files @strutvane/ui
cd ../..

# 4. Apply the patches on fresh clones and gate each repo
#    (dependents need @strutvane/framework 0.1.0-next.1: until it is published, junction the
#     patched framework clone into node_modules/@strutvane/framework, as done here)
for d in framework auth logs files ui create-strutvane; do
  ref=main; [ $d = framework ] && ref=v2/consolidate
  git clone -q --branch $ref "$P/$d" "apply-$d" && (cd "apply-$d" && git am --3way "$S/packaging-patches/$d/"*.patch)
done
# framework: npm run ci                    -> 1289 passed + 14 skipped, coverage 96.66/90.61/96.78/97.47
# auth/logs/files/ui: biome, tsc, vitest --coverage, tsdown (auth 384, logs 287+1, files 231, ui 274)
# create-strutvane: same gate (386 + 1 skipped after the README test fix)

# 5. The fixed app: one framework, doctor green, boots
(cd clones/framework && npm pkg set version=0.1.0-next.1 && npm pack --pack-destination ../../tarballs-fixed && git checkout package.json)
for d in auth ui logs files; do (cd clones/$d && npm pack --ignore-scripts --pack-destination ../../tarballs-fixed); done
cd apps && node ../clones/create-strutvane/dist/cli.mjs fixed --preset full --db sqlite --auth email --extras logs --yes --no-git --pm npm --docker=off
cd fixed && npm install --ignore-scripts ../../tarballs-fixed/*.tgz
npm ls --all | grep @strutvane           # one @strutvane/framework@0.1.0-next.1, every dependent "deduped"
npm run sv -- doctor                       # all ok
npm run sv -- add files                    # "has no installer" (installer protocol not implemented)
node ../../packaging-patches/tools/boot-matrix.mjs           # missing / empty / malformed for every .env.example key

# 6. Legacy app (old templates) + patched framework: doctor must fail closed
cd ../gen-bare && npm install --ignore-scripts ../../tarballs-fixed/strutvane-framework-0.1.0-next.1.tgz
npm run sv -- doctor                       # exit 3: absorbed (core, cli, strutvane) + fix command
