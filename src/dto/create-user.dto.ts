import { userCreateSchema } from "@app/common/schemas/user/schema"
import { createZodDto } from "nestjs-zod"

export class CreateUserDto extends createZodDto(userCreateSchema) {}
