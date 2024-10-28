mc:
	npx sequelize-cli migration:create --name ${name}

mgprod:
	npx sequelize-cli db:migrate --env production

mgtest:
	npx sequelize-cli db:migrate --env test

mgdev:
	npx sequelize-cli db:migrate