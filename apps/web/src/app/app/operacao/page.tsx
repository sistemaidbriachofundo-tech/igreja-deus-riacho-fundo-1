import type { Metadata } from "next";
import { DasOperations } from "../../../components/DasOperations";

export const metadata:Metadata={
  title:"Operação integrada — DAS",
  description:"Gestão autenticada de ministérios, escalas, cuidado, financeiro e indicadores da Igreja de Deus.",
  robots:{index:false,follow:false},
};

export default function OperacaoPage(){
  return <DasOperations/>;
}
