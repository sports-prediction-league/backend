mc:
	npx sequelize-cli migration:create --name ${name}

mgprod:
	npx sequelize-cli db:migrate --env production

mgdev:
	npx sequelize-cli db:migrate