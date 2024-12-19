mc:
	npx sequelize-cli migration:create --name ${name}

mgprod:
	npx sequelize-cli db:migrate --env production

mgtest:
	export NODE_TLS_REJECT_UNAUTHORIZED='0' && npx sequelize-cli db:migrate --env test

mgdev:
	npx sequelize-cli db:migrate