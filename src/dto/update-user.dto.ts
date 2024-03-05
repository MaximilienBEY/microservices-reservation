import { userUpdateSchema } from "@app/common/schemas/user/schema"
import { createZodDto } from "nestjs-zod"

export class UpdateUserDto extends createZodDto(userUpdateSchema) {}
