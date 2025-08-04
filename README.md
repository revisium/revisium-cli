## .env

```
REVISIUM_API_URL=http://localhost:8080
REVISIUM_USERNAME=
REVISIUM_PASSWORD=
REVISIUM_ORGANIZATION=
REVISIUM_PROJECT=
REVISIUM_BRANCH=
```

## save migrations

```shell
npx revisium migrate save --file ./example.json
```

## apply migrations

```shell
npx revisium migrate apply --file ./example.json
```
